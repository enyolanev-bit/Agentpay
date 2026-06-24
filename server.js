// AgentPay - couche de paiement pour agents IA sur Mollie.
//
// Flux : un humain cree un compte + connecte un moyen de paiement (mandat Mollie).
// Il attache des agents avec des policies. Un agent appelle POST /agent/pay.
//   -> policy deterministe (le LLM ne touche pas l'argent)
//   -> verifier Codex adversarial
//   -> execution Mollie (charge recurring sur le mandat, sans checkout)
//   -> tout est trace dans l'audit.

import 'dotenv/config'; // DOIT etre le 1er import : charge .env avant que mollie.js lise process.env
import express from 'express';

import {
  createAccount, getAccount, getAccountByCustomer, updatePayment,
  createAgent, getAgent, findAgentByToken, findAgentByHandleOrId, agentsForAccount, providersForAccount,
  toCents, addAudit, auditLog, getPaymentByMollieId, pendingHumanPayments, pendingReversiblePayments, getPayment,
  loadStore, policyTemplateIds,
} from './store.js';
import { createCustomer, createFirstPayment, getValidMandate, getMolliePayment } from './mollie.js';
import {
  requestPayment, requestReversiblePayment, cancelPayment, confirmPayment,
  requestAgentToAgentPayment, approvePayment, rejectPayment, settleA2A,
} from './flow.js';
import { runEarningDemo, runTask } from './tasks.js';
import {
  renderSetup, renderDashboard, renderAudit, renderTaskLive, renderTaskResult, renderMarket, renderEarnDemo,
  renderCreditTopupDemo, renderMobileNotif, manifestJson, serviceWorkerJs,
} from './views.js';
import { seedDemo } from './seed.js';
import { creditTopupOption, creditTopupProviders, getCreditTopupScenario } from './credit-scenarios.js';

const { MOLLIE_API_KEY, BASE_URL, PORT = 3000, AGENTPAY_DATA_FILE = 'data/agentpay.json' } = process.env;

if (!MOLLIE_API_KEY) { console.error('MOLLIE_API_KEY manquante. Copie .env.example en .env.'); process.exit(1); }
if (!BASE_URL) { console.error('BASE_URL manquante (URL ngrok https).'); process.exit(1); }

const storeLoaded = await loadStore(AGENTPAY_DATA_FILE === ':memory:' ? null : AGENTPAY_DATA_FILE);
if (AGENTPAY_DATA_FILE !== ':memory:') {
  console.log(`[store] ${storeLoaded ? 'charge' : 'nouveau'}: ${AGENTPAY_DATA_FILE}`);
}

const app = express();
app.use(express.urlencoded({ extended: false })); // formulaires HTML + webhook Mollie
app.use(express.json());                           // API agent (JSON)

// Pour la demo : un seul compte "courant". Cree au boot via seed, ou via le formulaire.
let currentAccountId = seedDemo();

const reversibleIntentDto = (payment) => ({
  intentId: payment.id,
  paymentId: payment.id,
  status: payment.status,
  amount: (payment.amountCents / 100).toFixed(2),
  currency: payment.currency,
  merchant: payment.merchant,
  claim: payment.claim,
  commitAfter: payment.reversibleUntilMs ? new Date(payment.reversibleUntilMs).toISOString() : null,
  commitAfterMs: payment.reversibleUntilMs,
  policy: payment.policyDecision,
  verifier: payment.verifierVerdict,
  molliePaymentId: payment.molliePaymentId,
  statusUrl: `${BASE_URL}/api/payments/${payment.id}`,
  undoUrl: `${BASE_URL}/pay/${payment.id}/undo`,
  confirmUrl: `${BASE_URL}/pay/${payment.id}/confirm`,
});

const demoPayerAgent = () => {
  const agents = agentsForAccount(currentAccountId);
  return agents.find((a) => a.role === 'payer') ?? agents[0] ?? null;
};

// --- UI -------------------------------------------------------------------

app.get('/', (req, res) => {
  const account = getAccount(currentAccountId);
  if (!account) return res.send(renderSetup());
  res.send(renderDashboard({ account, pending: pendingHumanPayments(), baseUrl: BASE_URL }));
});

app.post('/accounts', async (req, res) => {
  const name = String(req.body.name ?? '').trim();
  if (!name) return res.redirect('/');
  const account = createAccount({ name, email: String(req.body.email ?? '').trim() });
  try {
    const customer = await createCustomer({ name: account.name, email: account.email });
    account.mollieCustomerId = customer.id;
    addAudit({ event: 'account.created', detail: `${account.name} (customer ${customer.id})` });
  } catch (err) {
    addAudit({ event: 'account.created', detail: `${account.name} (customer Mollie KO: ${err.message})` });
  }
  currentAccountId = account.id;
  res.redirect('/');
});

app.post('/agents', (req, res) => {
  const account = getAccount(currentAccountId);
  if (!account) return res.redirect('/');
  const name = String(req.body.name ?? '').trim() || 'Agent';
  const role = req.body.role === 'provider' ? 'provider' : 'payer';
  const requestedProfile = String(req.body.policyProfile ?? 'developer_agent');
  const policyProfile = policyTemplateIds().includes(requestedProfile) ? requestedProfile : 'developer_agent';
  const service = role === 'provider' ? { label: `Service de ${name}`, priceCents: 250 } : null;
  const agent = createAgent({ accountId: account.id, name, role, service, policyProfile });
  addAudit({ agentId: agent.id, event: 'agent.created', detail: `${name} (${agent.handle}, ${role}, ${agent.policyProfile})` });
  res.redirect('/');
});

app.post('/agents/:id/policy', (req, res) => {
  const agent = getAgent(req.params.id);
  if (!agent) return res.status(404).send('Agent introuvable');
  const maxPerTx = toCents(req.body.maxPerTx);
  const maxPerDay = toCents(req.body.maxPerDay);
  const approvalThreshold = toCents(req.body.approvalThreshold);
  if (maxPerTx) agent.policy.maxPerTxCents = maxPerTx;
  if (maxPerDay) agent.policy.maxPerDayCents = maxPerDay;
  if (approvalThreshold) agent.policy.approvalThresholdCents = approvalThreshold;
  agent.policy.allowedMerchants = String(req.body.allowedMerchants ?? '')
    .split(',').map((s) => s.trim()).filter(Boolean);
  agent.policyProfile = 'custom';
  addAudit({ agentId: agent.id, event: 'policy.updated', detail: `tx<=${maxPerTx} jour<=${maxPerDay} seuil=${approvalThreshold} marchands=[${agent.policy.allowedMerchants.join(',')}]` });
  res.redirect('/');
});

// --- API AGENT : le coeur. Un agent demande a payer. ----------------------

app.post('/agent/pay', async (req, res) => {
  const auth = req.headers.authorization ?? '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : (req.body.token ?? '');
  const agent = findAgentByToken(token);
  if (!agent) return res.status(401).json({ error: 'token agent invalide' });

  const amountCents = toCents(req.body.amount);
  if (!amountCents) return res.status(400).json({ error: 'montant invalide (doit etre > 0)' });

  const payment = await requestPayment({
    agent,
    amountCents,
    currency: req.body.currency ?? 'EUR',
    merchant: String(req.body.merchant ?? '').trim(),
    description: String(req.body.description ?? '').trim(),
    category: String(req.body.category ?? '').trim(),
  });

  // Reponse claire pour l'agent appelant : ce qui s'est passe et pourquoi.
  res.status(payment.status === 'rejected' || payment.status === 'blocked_by_verifier' ? 200 : 200).json({
    paymentId: payment.id,
    status: payment.status,
    amount: (payment.amountCents / 100).toFixed(2),
    currency: payment.currency,
    policy: payment.policyDecision,
    verifier: payment.verifierVerdict,
    molliePaymentId: payment.molliePaymentId,
    statusUrl: `${BASE_URL}/api/payments/${payment.id}`,
  });
});

// API agent REVERSIBLE : coexistence avec /agent/pay pour garder la demo hackathon intacte.
// Le paiement est cree en pending_reversible et ne touche pas Mollie avant confirm/expiry.
app.post('/agent/pay-reversible', async (req, res) => {
  const auth = req.headers.authorization ?? '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : (req.body.token ?? '');
  const agent = findAgentByToken(token);
  if (!agent) return res.status(401).json({ error: 'token agent invalide' });

  const amountCents = toCents(req.body.amount);
  if (!amountCents) return res.status(400).json({ error: 'montant invalide (doit etre > 0)' });

  const payment = await requestReversiblePayment({
    agent,
    amountCents,
    currency: req.body.currency ?? 'EUR',
    merchant: String(req.body.merchant ?? '').trim(),
    description: String(req.body.description ?? '').trim(),
    claim: String(req.body.claim ?? req.body.description ?? '').trim(),
    idempotencyKey: String(req.headers['idempotency-key'] ?? req.body.idempotencyKey ?? '').trim() || null,
  });

  res.json({ type: 'ReversiblePaymentIntent', ...reversibleIntentDto(payment) });
});

// Credit/spend-control API: the agent chooses the provider, never the amount.
// Amounts and payment claims come from deterministic server-side fixtures.
app.get('/agent/credit-topups', (req, res) => {
  res.json({
    providers: creditTopupProviders().map(creditTopupOption),
  });
});

app.post('/agent/credit-topup', async (req, res) => {
  const auth = req.headers.authorization ?? '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : (req.body.token ?? '');
  const agent = findAgentByToken(token);
  if (!agent) return res.status(401).json({ error: 'token agent invalide' });

  const provider = String(req.body.provider ?? req.body.scenario ?? '').trim().toLowerCase();
  const scenario = getCreditTopupScenario(provider);
  if (!scenario) {
    return res.status(400).json({
      error: 'provider credit inconnu',
      allowedProviders: creditTopupProviders().map((item) => item.provider),
    });
  }

  const payment = await requestReversiblePayment({
    agent,
    amountCents: scenario.amountCents,
    currency: scenario.currency,
    merchant: scenario.merchant,
    description: scenario.description,
    category: 'credits',
    claim: scenario.claim,
    idempotencyKey: String(req.headers['idempotency-key'] ?? req.body.idempotencyKey ?? '').trim() || null,
  });
  addAudit({
    paymentId: payment.id,
    agentId: agent.id,
    event: 'credit_topup.intent',
    detail: `${scenario.merchant}: ${scenario.reason}`,
  });

  res.status(201).json({
    type: 'CreditTopupIntent',
    provider: scenario.provider,
    spendType: scenario.spendType,
    description: scenario.description,
    claim: scenario.claim,
    reason: scenario.reason,
    ...reversibleIntentDto(payment),
  });
});

app.post('/pay/:id/undo', (req, res) => {
  const payment = cancelPayment(req.params.id, getAccount(currentAccountId)?.name ?? 'humain');
  if (!payment) return res.status(404).json({ error: 'paiement inconnu' });
  res.json({
    paymentId: payment.id,
    status: payment.status,
    molliePaymentId: payment.molliePaymentId,
    decidedBy: payment.decidedBy,
  });
});

app.post('/pay/:id/confirm', async (req, res) => {
  const payment = await confirmPayment(req.params.id, getAccount(currentAccountId)?.name ?? 'humain');
  if (!payment) return res.status(404).json({ error: 'paiement inconnu' });
  res.json({
    paymentId: payment.id,
    status: payment.status,
    molliePaymentId: payment.molliePaymentId,
    decidedBy: payment.decidedBy,
  });
});

app.get('/api/reversible-intents', (req, res) => {
  res.json({ intents: pendingReversiblePayments().map(reversibleIntentDto) });
});

app.post('/demo/reversible-intent', async (req, res) => {
  const agent = demoPayerAgent();
  if (!agent) return res.status(400).json({ error: 'no payer agent available' });
  const scenario = String(req.body?.scenario ?? req.query.scenario ?? 'clean');
  const isLiar = scenario === 'liar';
  const payment = await requestReversiblePayment({
    agent,
    amountCents: isLiar ? 1500 : 1800,
    currency: 'EUR',
    merchant: isLiar ? '0xBAD wallet' : 'Bookstore',
    description: isLiar ? 'transfer' : 'a book for personal growth',
    claim: isLiar ? 'API credits' : 'a book to help you grow',
  });
  res.status(201).json({ type: 'ReversiblePaymentIntent', scenario: isLiar ? 'liar' : 'clean', ...reversibleIntentDto(payment) });
});

app.post('/demo/credit-topup', async (req, res) => {
  const agent = demoPayerAgent();
  if (!agent) return res.status(400).json({ error: 'no payer agent available' });
  const scenarioName = String(req.body?.scenario ?? req.query.scenario ?? 'openrouter').toLowerCase();
  const scenario = getCreditTopupScenario(scenarioName) ?? getCreditTopupScenario('openrouter');
  const payment = await requestReversiblePayment({
    agent,
    amountCents: scenario.amountCents,
    currency: 'EUR',
    merchant: scenario.merchant,
    description: scenario.description,
    category: 'credits',
    claim: scenario.claim,
    idempotencyKey: String(req.headers['idempotency-key'] ?? req.body?.idempotencyKey ?? '').trim() || null,
  });
  addAudit({
    paymentId: payment.id,
    agentId: agent.id,
    event: 'credit_topup.intent',
    detail: `${scenario.merchant}: ${scenario.reason}`,
  });
  res.status(201).json({
    type: 'CreditTopupIntent',
    scenario: scenarioName,
    provider: scenario.provider,
    spendType: scenario.spendType,
    description: scenario.description,
    claim: scenario.claim,
    reason: scenario.reason,
    ...reversibleIntentDto(payment),
  });
});

app.get('/manifest.json', (req, res) => {
  res.type('application/manifest+json').send(manifestJson());
});

app.get('/sw.js', (req, res) => {
  res.type('application/javascript').send(serviceWorkerJs());
});

app.get('/m', (req, res) => {
  res.send(renderMobileNotif());
});

app.get('/m/stream', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.write(': connected\n\n');
  const tick = () => {
    res.write(`data: ${JSON.stringify({ intents: pendingReversiblePayments().map(reversibleIntentDto) })}\n\n`);
  };
  tick();
  const interval = setInterval(tick, 1000);
  req.on('close', () => clearInterval(interval));
});

// API A2A : un agent paie un autre agent pour un service. Memes garde-fous.
app.post('/agent/pay-agent', async (req, res) => {
  const auth = req.headers.authorization ?? '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : (req.body.token ?? '');
  const payerAgent = findAgentByToken(token);
  if (!payerAgent) return res.status(401).json({ error: 'token agent invalide' });

  const payeeAgent = findAgentByHandleOrId(req.body.payee);
  if (!payeeAgent) return res.status(404).json({ error: 'agent payee introuvable (handle ou id)' });
  if (payeeAgent.id === payerAgent.id) return res.status(400).json({ error: 'un agent ne peut pas se payer lui-meme' });

  // Montant : explicite, sinon le prix du service du provider.
  const amountCents = toCents(req.body.amount) ?? payeeAgent.service?.priceCents ?? null;
  if (!amountCents) return res.status(400).json({ error: 'montant invalide et pas de prix de service' });

  const payment = await requestAgentToAgentPayment({
    payerAgent, payeeAgent, amountCents,
    currency: req.body.currency ?? 'EUR',
    service: String(req.body.service ?? payeeAgent.service?.label ?? '').trim(),
  });

  res.json({
    paymentId: payment.id, status: payment.status, kind: 'a2a',
    from: payerAgent.handle, to: payeeAgent.handle,
    amount: (payment.amountCents / 100).toFixed(2), currency: payment.currency,
    policy: payment.policyDecision, verifier: payment.verifierVerdict,
    statusUrl: `${BASE_URL}/api/payments/${payment.id}`,
  });
});

// Catalogue marketplace : providers disponibles pour le compte courant.
app.get('/api/agents/catalog', (req, res) => {
  const q = String(req.query.q ?? '').trim().toLowerCase();
  const providers = providersForAccount(currentAccountId)
    .filter((provider) => provider.service)
    .filter((provider) => !q || provider.service.label.toLowerCase().includes(q))
    .map((provider) => ({
      handle: provider.handle,
      service: provider.service.label,
      priceCents: provider.service.priceCents,
      earningsCents: provider.earningsCents,
    }));
  res.json({ providers });
});

// Statut d'un paiement (l'agent peut poller, ex: apres une approbation humaine).
app.get('/api/payments/:id', (req, res) => {
  const payment = getPayment(req.params.id);
  if (!payment) return res.status(404).json({ error: 'inconnu' });
  res.json({
    paymentId: payment.id, status: payment.status,
    amount: (payment.amountCents / 100).toFixed(2), currency: payment.currency,
    policy: payment.policyDecision, verifier: payment.verifierVerdict,
    molliePaymentId: payment.molliePaymentId,
  });
});

// --- Approbation humaine (human-in-the-loop) ------------------------------

app.post('/approvals/:id/approve', async (req, res) => {
  await approvePayment(req.params.id, getAccount(currentAccountId)?.name ?? 'humain');
  res.redirect('/');
});
app.post('/approvals/:id/reject', (req, res) => {
  rejectPayment(req.params.id, getAccount(currentAccountId)?.name ?? 'humain');
  res.redirect('/');
});

// --- Onboarding du moyen de paiement (mandat Mollie) ----------------------

// IMPORTANT : /onboard/return AVANT /onboard/:accountId, sinon Express capture "return"
// comme un accountId et renvoie "Compte introuvable".
app.get('/onboard/return', async (req, res) => {
  const account = getAccount(req.query.account);
  if (account?.mollieCustomerId) {
    try {
      const mandate = await getValidMandate(account.mollieCustomerId);
      if (mandate) {
        account.mandateId = mandate.id;
        addAudit({ event: 'onboarding.mandate', detail: `mandat ${mandate.id} actif pour ${account.name}` });
      }
    } catch { /* le webhook reessaiera */ }
  }
  res.redirect('/');
});

app.get('/onboard/:accountId', async (req, res) => {
  const account = getAccount(req.params.accountId);
  if (!account) return res.status(404).send('Compte introuvable');
  try {
    // Cree le customer Mollie a la volee s'il manque (compte issu du seed).
    if (!account.mollieCustomerId) {
      const customer = await createCustomer({ name: account.name, email: account.email });
      account.mollieCustomerId = customer.id;
      addAudit({ event: 'account.customer', detail: `customer Mollie ${customer.id} pour ${account.name}` });
    }
    const payment = await createFirstPayment({ account, amountCents: 100 });
    addAudit({ event: 'onboarding.started', detail: `first payment ${payment.id} pour ${account.name}` });
    res.redirect(payment.getCheckoutUrl());
  } catch (err) {
    res.status(500).send(`Erreur onboarding: ${err.message}`);
  }
});

// --- Webhook Mollie : SOURCE DE VERITE du statut --------------------------

app.post('/webhook', async (req, res) => {
  try {
    const molliePaymentId = req.body.id;
    if (!molliePaymentId) return res.status(400).send('id manquant');
    const molliePayment = await getMolliePayment(molliePaymentId);

    // Cas onboarding : un mandat vient d'etre cree.
    if (molliePayment.metadata?.kind === 'onboarding') {
      const account = getAccountByCustomer(molliePayment.customerId);
      if (account && molliePayment.status === 'paid' && !account.mandateId) {
        const mandate = await getValidMandate(account.mollieCustomerId);
        if (mandate) { account.mandateId = mandate.id; addAudit({ event: 'onboarding.mandate', detail: `mandat ${mandate.id} (webhook)` }); }
      }
    }

    // Cas paiement d'agent : on reflete le statut reel.
    const payment = getPaymentByMollieId(molliePaymentId);
    if (payment && molliePayment.status === 'paid' && payment.status !== 'paid') {
      updatePayment(payment.id, { status: 'paid' });
      addAudit({ paymentId: payment.id, agentId: payment.agentId, event: 'mollie.paid', detail: 'confirme par webhook' });
      settleA2A(getPayment(payment.id)); // credite le provider si c'etait un paiement A2A
    }
    console.log(`webhook: ${molliePaymentId} => ${molliePayment.status}`);
    res.sendStatus(200);
  } catch (err) {
    console.error('Erreur webhook:', err.message);
    res.sendStatus(200);
  }
});

// --- Agent Codex live : reçoit une tâche, décide, paie un agent, livre ----

app.get('/task', (req, res) => res.send(renderTaskLive()));
app.get('/credits', (req, res) => {
  const account = getAccount(currentAccountId);
  if (!account) return res.redirect('/');
  res.send(renderCreditTopupDemo({ account }));
});
app.get('/earn', (req, res) => {
  const account = getAccount(currentAccountId);
  if (!account) return res.redirect('/');
  res.send(renderEarnDemo({ account }));
});

app.post('/earn/run', async (req, res) => {
  if (process.env.SIMULATE_PAYMENTS !== '1') {
    return res.status(409).json({
      error: 'earn demo requires SIMULATE_PAYMENTS=1',
      reason: 'This route is a product demo and never runs against live money.',
    });
  }
  const account = getAccount(currentAccountId);
  if (!account) return res.status(400).json({ error: 'pas de compte' });
  const timeline = [];
  const result = await runEarningDemo({
    accountId: account.id,
    onStep: (step) => timeline.push({ event: step.event, detail: step.detail, task: step.task ?? null }),
  });
  res.json({
    objective: result.objective,
    paidRuns: result.paidRuns,
    totalRuns: result.totalRuns,
    earnedCents: result.earnedCents,
    earningsBefore: result.earningsBefore,
    earningsAfter: result.earningsAfter,
    providers: result.providers,
    timeline,
  });
});

app.post('/task/run', async (req, res) => {
  const account = getAccount(currentAccountId);
  if (!account) return res.redirect('/');
  const result = await runTask({ accountId: account.id, taskText: String(req.body.task ?? '') });
  res.send(renderTaskResult(result));
});

// Stream SSE (live) : chaque étape arrive en direct, les garde-fous s'allument côté UI.
app.get('/task/stream', async (req, res) => {
  const account = getAccount(currentAccountId);
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no', // évite le buffering (proxy/ngrok)
  });
  res.write(': connected\n\n');
  if (!account) { res.write('event: done\ndata: {"error":"pas de compte"}\n\n'); return res.end(); }

  const send = (step) => res.write(`data: ${JSON.stringify(step)}\n\n`);
  try {
    const result = await runTask({ accountId: account.id, taskText: String(req.query.task ?? ''), onStep: send });
    res.write(`event: done\ndata: ${JSON.stringify({
      paymentStatus: result.payment?.status ?? null,
      payer: result.payer, payee: result.payee, deliverable: result.deliverable,
    })}\n\n`);
  } catch (err) {
    res.write(`event: done\ndata: ${JSON.stringify({ error: err.message })}\n\n`);
  }
  res.end();
});

// Variante API (pour demo.sh) : renvoie la timeline en JSON.
app.post('/api/task/run', async (req, res) => {
  const account = getAccount(currentAccountId);
  if (!account) return res.status(400).json({ error: 'pas de compte' });
  const result = await runTask({ accountId: account.id, taskText: String(req.body.task ?? '') });
  res.json({
    task: result.task,
    payer: result.payer, payee: result.payee,
    decision: result.timeline.find((s) => s.event === 'agent.decision')?.decision ?? null,
    paymentStatus: result.payment?.status ?? null,
    verifier: result.payment?.verifierVerdict ?? null,
    delivered: !!result.deliverable,
    timeline: result.timeline.map((s) => ({ event: s.event, detail: s.detail })),
  });
});

app.get('/audit', (req, res) => res.send(renderAudit(auditLog({ limit: 150 }))));
app.get('/market', (req, res) => res.send(renderMarket()));

// Confort demo : token du payeur + handle d'un provider (pour demo.sh).
app.get('/api/demo-token', (req, res) => {
  const agents = agentsForAccount(currentAccountId);
  const payer = agents.find((a) => a.role === 'payer') ?? agents[0];
  const provider = agents.find((a) => a.role === 'provider');
  res.json({ token: payer?.token ?? null, payeeHandle: provider?.handle ?? null });
});

if (process.env.VERCEL !== '1') {
  app.listen(PORT, () => {
    console.log(`AgentPay sur http://localhost:${PORT}  (public: ${BASE_URL})`);
    console.log(`Mode paiement: ${process.env.SIMULATE_PAYMENTS === '1' ? 'SIMULE' : 'Mollie reel si mandat'} | Verifier: ${process.env.VERIFIER_MODE ?? 'codex'}`);
  });
}

export default app;
