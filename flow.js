// Orchestration d'un paiement declenche par un agent.
//
// Pipeline : policy (deterministe) -> verifier (Codex adversarial) -> execution (Mollie).
// Chaque etape ecrit dans l'audit. C'est ici que les 3 garde-fous s'enchainent.

import {
  getAccount, getAgent, createPayment, updatePayment, addAudit, getPayment, creditAgent,
  findPaymentByIdempotencyKey,
} from './store.js';
import { decide, DECISION } from './policy.js';
import { verify } from './verifier.js';
import { chargeAgentPayment } from './mollie.js';

const SIMULATE = process.env.SIMULATE_PAYMENTS === '1';
const WINDOW_MS_DEFAULT = Number(process.env.UNDO_WINDOW_MS ?? 60_000);

// Construit l'objet "requete" passe a la policy et au verifier (jamais de secrets dedans).
const toRequest = (payment, agent) => ({
  amountCents: payment.amountCents,
  currency: payment.currency,
  merchant: payment.merchant,
  description: payment.description,
  category: payment.category,
  claim: payment.claim,
  agentName: agent.name,
});

// Execution reelle du mouvement d'argent. Le LLM n'intervient pas ici.
// Si pas de mandat (onboarding non fait) ou si Mollie echoue, on simule pour ne pas casser la demo.
async function executePayment(payment, account, agent) {
  const req = toRequest(payment, agent);

  if (!SIMULATE && account.mollieCustomerId) {
    try {
      const molliePayment = await chargeAgentPayment({
        account,
        amountCents: payment.amountCents,
        currency: payment.currency,
        description: payment.description || `Paiement agent ${agent.name}`,
        metadata: { paymentId: payment.id, agentId: agent.id, merchant: payment.merchant },
      });
      updatePayment(payment.id, { molliePaymentId: molliePayment.id });
      addAudit({ paymentId: payment.id, agentId: agent.id, event: 'mollie.created', detail: `Mollie payment ${molliePayment.id} (${molliePayment.status})` });

      // En test, un paiement recurring valide passe 'paid' tout de suite ; sinon le webhook finalise.
      if (molliePayment.status === 'paid') {
        updatePayment(payment.id, { status: 'paid' });
        addAudit({ paymentId: payment.id, agentId: agent.id, event: 'mollie.paid', detail: `Encaisse via Mollie` });
      } else {
        updatePayment(payment.id, { status: 'executing' });
      }
      return getPayment(payment.id);
    } catch (err) {
      addAudit({ paymentId: payment.id, agentId: agent.id, event: 'mollie.error', detail: `Mollie KO (${err.message}) -> simulation` });
      // on retombe sur la simulation ci-dessous
    }
  }

  // Mode simule : la demo policy/verifier/humain marche meme sans mandat reel.
  const fakeId = `sim_${payment.id}`;
  updatePayment(payment.id, { status: 'paid', molliePaymentId: fakeId });
  addAudit({ paymentId: payment.id, agentId: agent.id, event: 'mollie.simulated', detail: `Paiement simule ${fakeId}` });
  return getPayment(payment.id);
}

// Lance le verifier Codex puis execute si feu vert. Utilise par le chemin auto ET le chemin humain.
async function verifyThenExecute(payment, account, agent) {
  const verdict = await verify(toRequest(payment, agent));
  updatePayment(payment.id, { verifierVerdict: verdict });

  if (!verdict.allow) {
    updatePayment(payment.id, { status: 'blocked_by_verifier' });
    addAudit({
      paymentId: payment.id, agentId: agent.id, event: 'verifier.blocked',
      detail: `[${verdict.source}] ${verdict.reason} (flags: ${verdict.flags.join(', ') || 'aucun'})`,
    });
    return getPayment(payment.id);
  }

  addAudit({
    paymentId: payment.id, agentId: agent.id, event: 'verifier.allow',
    detail: `[${verdict.source}] risk=${verdict.risk} - ${verdict.reason}`,
  });
  const executed = await executePayment(payment, account, agent);
  settleA2A(executed); // si c'est un paiement agent-to-agent, crediter le provider
  return getPayment(payment.id);
}

// Settlement A2A : une fois le paiement 'paid', on credite l'agent provider. Idempotent.
export function settleA2A(payment) {
  if (!payment || payment.kind !== 'a2a' || !payment.payeeAgentId) return;
  if (payment.status !== 'paid' || payment.credited) return;
  const payee = getAgent(payment.payeeAgentId);
  if (!payee) return;
  creditAgent(payee.id, { amountCents: payment.amountCents, fromAgentId: payment.agentId, paymentId: payment.id });
  updatePayment(payment.id, { credited: true });
  addAudit({
    paymentId: payment.id, agentId: payee.id, event: 'a2a.credited',
    detail: `${payee.handle} credite de ${(payment.amountCents / 100).toFixed(2)} ${payment.currency} par l'agent payeur`,
  });
}

// POINT D'ENTREE : un agent demande un paiement.
export async function requestPayment({ agent, amountCents, currency, merchant, description, category }) {
  const account = getAccount(agent.accountId);
  const payment = createPayment({
    agentId: agent.id, accountId: agent.accountId,
    amountCents, currency, merchant, description, category,
  });
  addAudit({
    paymentId: payment.id, agentId: agent.id, event: 'request.received',
    detail: `${merchant} - ${description}`,
  });

  // 1. Policy deterministe.
  const policyDecision = decide(agent, toRequest(payment, agent));
  updatePayment(payment.id, { policyDecision });

  if (policyDecision.decision === DECISION.REJECTED) {
    updatePayment(payment.id, { status: 'rejected', decidedBy: 'policy' });
    addAudit({ paymentId: payment.id, agentId: agent.id, event: 'policy.rejected', detail: policyDecision.reasons.join(' | ') });
    return getPayment(payment.id);
  }

  if (policyDecision.decision === DECISION.NEEDS_HUMAN) {
    updatePayment(payment.id, { status: 'needs_human' });
    addAudit({ paymentId: payment.id, agentId: agent.id, event: 'policy.needs_human', detail: policyDecision.reasons.join(' | ') });
    return getPayment(payment.id); // en attente de validation humaine
  }

  // AUTO_APPROVE : on passe au verifier Codex puis a l'execution.
  addAudit({ paymentId: payment.id, agentId: agent.id, event: 'policy.auto_approve', detail: policyDecision.reasons.join(' | ') });
  return verifyThenExecute(payment, account, agent);
}

// Paiement reversible : la policy decide, puis on cree une intention annulable.
// Aucune charge Mollie n'est creee tant que l'humain ou l'expiration ne confirme pas.
export async function requestReversiblePayment({
  agent,
  amountCents,
  currency,
  merchant,
  description,
  category,
  claim,
  idempotencyKey,
  windowMs = WINDOW_MS_DEFAULT,
  autoSchedule = true,
}) {
  const existing = findPaymentByIdempotencyKey({ agentId: agent.id, kind: 'merchant', idempotencyKey });
  if (existing) {
    addAudit({
      paymentId: existing.id,
      agentId: agent.id,
      event: 'idempotency.reused',
      detail: `key=${idempotencyKey}`,
    });
    return existing;
  }

  const payment = createPayment({
    agentId: agent.id,
    accountId: agent.accountId,
    amountCents,
    currency,
    merchant,
    description,
    category,
    claim,
    kind: 'merchant',
    idempotencyKey,
  });
  addAudit({
    paymentId: payment.id,
    agentId: agent.id,
    event: 'request.received',
    detail: `${merchant} - ${claim || description}`,
  });

  const policyDecision = decide(agent, toRequest(payment, agent));
  updatePayment(payment.id, { policyDecision });

  if (policyDecision.decision === DECISION.REJECTED) {
    updatePayment(payment.id, { status: 'rejected', decidedBy: 'policy' });
    addAudit({ paymentId: payment.id, agentId: agent.id, event: 'policy.rejected', detail: policyDecision.reasons.join(' | ') });
    return getPayment(payment.id);
  }

  updatePayment(payment.id, {
    status: 'pending_reversible',
    reversibleUntilMs: Date.now() + windowMs,
  });
  addAudit({
    paymentId: payment.id,
    agentId: agent.id,
    event: 'pending.reversible',
    detail: `fenetre ${windowMs}ms`,
  });
  if (autoSchedule) scheduleReversible(payment.id, windowMs);
  return getPayment(payment.id);
}

export async function runVerifier(paymentId) {
  const payment = getPayment(paymentId);
  if (!payment || payment.status !== 'pending_reversible') return payment?.verifierVerdict ?? null;
  const agent = getAgent(payment.agentId);
  const verdict = await verify(toRequest(payment, agent));
  const current = getPayment(paymentId);
  if (!current || current.status !== 'pending_reversible') return verdict;
  updatePayment(paymentId, { verifierVerdict: verdict });

  const event = verdict.allow ? 'verifier.allow' : 'verifier.blocked';
  addAudit({
    paymentId,
    agentId: agent.id,
    event,
    detail: `[${verdict.source}] ${verdict.reason} (flags: ${verdict.flags.join(', ') || 'aucun'})`,
  });
  const refreshed = getPayment(paymentId);
  if (refreshed?.reversibleUntilMs && refreshed.reversibleUntilMs <= Date.now()) {
    await commitIfDue(paymentId);
  }
  return verdict;
}

export async function commitIfDue(paymentId) {
  const payment = getPayment(paymentId);
  if (!payment || payment.status !== 'pending_reversible') return payment;
  if (!payment.reversibleUntilMs || payment.reversibleUntilMs > Date.now()) return payment;

  if (!payment.verifierVerdict) {
    addAudit({
      paymentId,
      agentId: payment.agentId,
      event: 'auto_commit.waiting_verifier',
      detail: 'expiration atteinte, verifier encore absent',
    });
    return getPayment(paymentId);
  }

  if (!payment.verifierVerdict.allow) {
    updatePayment(paymentId, { status: 'blocked_by_verifier' });
    addAudit({
      paymentId,
      agentId: payment.agentId,
      event: 'auto_commit.blocked',
      detail: payment.verifierVerdict.reason,
    });
    return getPayment(paymentId);
  }

  if (payment.policyDecision?.decision === DECISION.NEEDS_HUMAN) {
    addAudit({
      paymentId,
      agentId: payment.agentId,
      event: 'auto_commit.needs_human',
      detail: 'montant sous fenetre reversible mais au-dessus du seuil de confirmation',
    });
    return getPayment(paymentId);
  }

  const account = getAccount(payment.accountId);
  const agent = getAgent(payment.agentId);
  updatePayment(paymentId, { status: 'committing', decidedBy: 'auto:expiry' });
  addAudit({ paymentId, agentId: agent.id, event: 'auto_commit.confirmed', detail: 'fenetre undo expiree' });
  const executed = await executePayment(payment, account, agent);
  settleA2A(executed);
  return getPayment(paymentId);
}

export function scheduleReversible(paymentId, windowMs = WINDOW_MS_DEFAULT) {
  runVerifier(paymentId).catch((err) => {
    const payment = getPayment(paymentId);
    if (!payment) return;
    addAudit({
      paymentId,
      agentId: payment.agentId,
      event: 'verifier.error',
      detail: err.message,
    });
  });

  const timer = setTimeout(() => {
    commitIfDue(paymentId).catch((err) => {
      const payment = getPayment(paymentId);
      if (!payment) return;
      addAudit({
        paymentId,
        agentId: payment.agentId,
        event: 'auto_commit.error',
        detail: err.message,
      });
    });
  }, windowMs);
  timer.unref?.();
  return timer;
}

export function cancelPayment(paymentId, who = 'humain') {
  const payment = getPayment(paymentId);
  if (!payment || payment.status !== 'pending_reversible') return payment;
  updatePayment(paymentId, { status: 'cancelled', decidedBy: `human:${who}` });
  addAudit({
    paymentId,
    agentId: payment.agentId,
    event: 'undo.cancelled',
    detail: `annule par ${who} - jamais charge`,
  });
  return getPayment(paymentId);
}

export async function confirmPayment(paymentId, who = 'humain') {
  const payment = getPayment(paymentId);
  if (!payment || payment.status !== 'pending_reversible') return payment;
  const account = getAccount(payment.accountId);
  const agent = getAgent(payment.agentId);
  updatePayment(paymentId, { status: 'committing', decidedBy: `human:${who}` });
  addAudit({ paymentId, agentId: agent.id, event: 'confirm.human', detail: `confirme par ${who}` });
  const executed = await executePayment(payment, account, agent);
  settleA2A(executed);
  return getPayment(paymentId);
}

// POINT D'ENTREE A2A : un agent paie un autre agent pour un service.
// Memes garde-fous : policy du payeur, verifier Codex (avec le contexte de la contrepartie), execution, audit.
export async function requestAgentToAgentPayment({ payerAgent, payeeAgent, amountCents, currency, service }) {
  const account = getAccount(payerAgent.accountId);
  const description = service || `Service de ${payeeAgent.name}`;
  const payment = createPayment({
    agentId: payerAgent.id, accountId: payerAgent.accountId,
    amountCents, currency,
    merchant: payeeAgent.handle,    // la contrepartie = un agent, pas un marchand classique
    description,
    category: 'a2a',
    kind: 'a2a', payeeAgentId: payeeAgent.id,
  });
  addAudit({
    paymentId: payment.id, agentId: payerAgent.id, event: 'a2a.request',
    detail: `${payerAgent.handle} -> ${payeeAgent.handle} : ${description}`,
  });

  const policyDecision = decide(payerAgent, toRequest(payment, payerAgent));
  updatePayment(payment.id, { policyDecision });

  if (policyDecision.decision === DECISION.REJECTED) {
    updatePayment(payment.id, { status: 'rejected', decidedBy: 'policy' });
    addAudit({ paymentId: payment.id, agentId: payerAgent.id, event: 'policy.rejected', detail: policyDecision.reasons.join(' | ') });
    return getPayment(payment.id);
  }
  if (policyDecision.decision === DECISION.NEEDS_HUMAN) {
    updatePayment(payment.id, { status: 'needs_human' });
    addAudit({ paymentId: payment.id, agentId: payerAgent.id, event: 'policy.needs_human', detail: policyDecision.reasons.join(' | ') });
    return getPayment(payment.id);
  }
  addAudit({ paymentId: payment.id, agentId: payerAgent.id, event: 'policy.auto_approve', detail: policyDecision.reasons.join(' | ') });
  return verifyThenExecute(payment, account, payerAgent);
}

// L'humain valide un paiement en attente : on lance quand meme le verifier Codex (defense en profondeur), puis on execute.
export async function approvePayment(paymentId, approver = 'humain') {
  const payment = getPayment(paymentId);
  if (!payment || payment.status !== 'needs_human') return payment;
  const agent = getAgent(payment.agentId);
  const account = getAccount(payment.accountId);
  updatePayment(payment.id, { decidedBy: `human:${approver}` });
  addAudit({ paymentId: payment.id, agentId: agent.id, event: 'human.approved', detail: `Valide par ${approver}` });
  return verifyThenExecute(payment, account, agent);
}

// L'humain refuse.
export function rejectPayment(paymentId, approver = 'humain') {
  const payment = getPayment(paymentId);
  if (!payment || payment.status !== 'needs_human') return payment;
  updatePayment(payment.id, { status: 'rejected', decidedBy: `human:${approver}` });
  addAudit({ paymentId: payment.id, agentId: payment.agentId, event: 'human.rejected', detail: `Refuse par ${approver}` });
  return getPayment(payment.id);
}
