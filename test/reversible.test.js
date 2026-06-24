import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createAccount,
  createAgent,
  createPayment,
  pendingReversiblePayments,
  updatePayment,
} from '../store.js';

process.env.MOLLIE_API_KEY ??= 'test_x';
process.env.VERIFIER_MODE = 'heuristic';

const { heuristicVerdict } = await import('../verifier.js');
const {
  cancelPayment,
  commitIfDue,
  confirmPayment,
  requestReversiblePayment,
  runVerifier,
} = await import('../flow.js');

function seedAgent(policy = {}) {
  const account = createAccount({ name: `T ${Date.now()} ${Math.random()}` });
  const agent = createAgent({
    accountId: account.id,
    name: 'Rev Agent',
    policy: {
      maxPerTxCents: 10_000,
      maxPerDayCents: 100_000,
      approvalThresholdCents: 50_000,
      allowedMerchants: [],
      ...policy,
    },
  });
  return { account, agent };
}

test('createPayment stocke le claim et reversibleUntilMs par defaut null', () => {
  const { account, agent } = seedAgent();
  const p = createPayment({
    agentId: agent.id,
    accountId: account.id,
    amountCents: 1200,
    currency: 'EUR',
    merchant: 'OpenAI',
    description: 'x',
    claim: 'credits API',
  });

  assert.equal(p.claim, 'credits API');
  assert.equal(p.reversibleUntilMs, null);
});

test('pendingReversiblePayments ne renvoie que les pending_reversible', () => {
  const { account, agent } = seedAgent();
  const p = createPayment({
    agentId: agent.id,
    accountId: account.id,
    amountCents: 1200,
    currency: 'EUR',
    merchant: 'OpenAI',
    description: 'x',
    claim: 'c',
  });
  updatePayment(p.id, { status: 'pending_reversible', reversibleUntilMs: Date.now() + 60000 });

  const ids = pendingReversiblePayments().map((x) => x.id);
  assert.ok(ids.includes(p.id));
});

test('requestReversiblePayment sous plafond -> pending_reversible, jamais charge', async () => {
  const { agent } = seedAgent();
  const p = await requestReversiblePayment({
    agent,
    amountCents: 1200,
    currency: 'EUR',
    merchant: 'OpenAI',
    description: 'API',
    claim: 'credits API',
    windowMs: 60000,
  });

  assert.equal(p.status, 'pending_reversible');
  assert.ok(p.reversibleUntilMs > Date.now());
  assert.equal(p.molliePaymentId, null);
});

test('requestReversiblePayment conserve la categorie credits', async () => {
  const { agent } = seedAgent();
  const p = await requestReversiblePayment({
    agent,
    amountCents: 2500,
    currency: 'EUR',
    merchant: 'OpenRouter',
    description: 'Inference credits top-up',
    category: 'credits',
    claim: 'OpenRouter inference credits for agent model calls',
    windowMs: 60000,
  });

  assert.equal(p.status, 'pending_reversible');
  assert.equal(p.category, 'credits');
});

test('requestReversiblePayment avec meme idempotencyKey renvoie le meme intent', async () => {
  const { agent } = seedAgent();
  const first = await requestReversiblePayment({
    agent,
    amountCents: 1200,
    currency: 'EUR',
    merchant: 'OpenAI',
    description: 'API',
    claim: 'credits API',
    idempotencyKey: 'retry-123',
    windowMs: 60000,
    autoSchedule: false,
  });
  const second = await requestReversiblePayment({
    agent,
    amountCents: 1200,
    currency: 'EUR',
    merchant: 'OpenAI',
    description: 'API',
    claim: 'credits API',
    idempotencyKey: 'retry-123',
    windowMs: 60000,
    autoSchedule: false,
  });

  assert.equal(second.id, first.id);
  assert.equal(second.molliePaymentId, null);
});

test('cancelPayment -> cancelled, jamais charge', async () => {
  const { agent } = seedAgent();
  const p = await requestReversiblePayment({
    agent,
    amountCents: 1200,
    currency: 'EUR',
    merchant: 'OpenAI',
    description: 'API',
    claim: 'c',
    windowMs: 60000,
  });
  const c = cancelPayment(p.id, 'humain');

  assert.equal(c.status, 'cancelled');
  assert.equal(c.molliePaymentId, null);
});

test('confirmPayment -> execute le paiement reversible', async () => {
  const { agent } = seedAgent();
  const p = await requestReversiblePayment({
    agent,
    amountCents: 1200,
    currency: 'EUR',
    merchant: 'OpenAI',
    description: 'API',
    claim: 'credits API',
    windowMs: 60000,
  });
  const confirmed = await confirmPayment(p.id, 'humain');

  assert.equal(confirmed.status, 'paid');
  assert.equal(confirmed.molliePaymentId, `sim_${p.id}`);
});

test('confirmPayment appele deux fois ne re-execute pas le paiement', async () => {
  const { agent } = seedAgent();
  const p = await requestReversiblePayment({
    agent,
    amountCents: 1200,
    currency: 'EUR',
    merchant: 'OpenAI',
    description: 'API',
    claim: 'credits API',
    windowMs: 60000,
    autoSchedule: false,
  });

  const first = await confirmPayment(p.id, 'humain');
  const second = await confirmPayment(p.id, 'humain');

  assert.equal(first.status, 'paid');
  assert.equal(second.status, 'paid');
  assert.equal(second.molliePaymentId, `sim_${p.id}`);
});

test('requestReversiblePayment au-dessus du plafond tx -> rejected', async () => {
  const { agent } = seedAgent({ maxPerTxCents: 1000 });
  const p = await requestReversiblePayment({
    agent,
    amountCents: 5000,
    currency: 'EUR',
    merchant: 'X',
    description: 'y',
    claim: 'z',
    windowMs: 60000,
  });

  assert.equal(p.status, 'rejected');
});

test('runVerifier attache un verdict au paiement reversible', async () => {
  const { agent } = seedAgent();
  const p = await requestReversiblePayment({
    agent,
    amountCents: 1200,
    currency: 'EUR',
    merchant: 'OpenAI',
    description: 'API',
    claim: 'credits API',
    windowMs: 60000,
    autoSchedule: false,
  });

  const verdict = await runVerifier(p.id);

  assert.equal(verdict.allow, true);
  assert.equal(p.verifierVerdict.allow, true);
});

test('commitIfDue avant expiration laisse le paiement en attente', async () => {
  const { agent } = seedAgent();
  const p = await requestReversiblePayment({
    agent,
    amountCents: 1200,
    currency: 'EUR',
    merchant: 'OpenAI',
    description: 'API',
    claim: 'credits API',
    windowMs: 60000,
    autoSchedule: false,
  });
  updatePayment(p.id, { verifierVerdict: { allow: true, risk: 'low', reason: 'ok', flags: [], source: 'test' } });

  const result = await commitIfDue(p.id);

  assert.equal(result.status, 'pending_reversible');
  assert.equal(result.molliePaymentId, null);
});

test('commitIfDue expire + verifier allow -> execute', async () => {
  const { agent } = seedAgent();
  const p = await requestReversiblePayment({
    agent,
    amountCents: 1200,
    currency: 'EUR',
    merchant: 'OpenAI',
    description: 'API',
    claim: 'credits API',
    windowMs: 60000,
    autoSchedule: false,
  });
  updatePayment(p.id, {
    reversibleUntilMs: Date.now() - 1,
    verifierVerdict: { allow: true, risk: 'low', reason: 'ok', flags: [], source: 'test' },
  });

  const result = await commitIfDue(p.id);

  assert.equal(result.status, 'paid');
  assert.equal(result.molliePaymentId, `sim_${p.id}`);
  assert.equal(result.decidedBy, 'auto:expiry');
});

test('commitIfDue apres confirmation humaine ne re-execute pas', async () => {
  const { agent } = seedAgent();
  const p = await requestReversiblePayment({
    agent,
    amountCents: 1200,
    currency: 'EUR',
    merchant: 'OpenAI',
    description: 'API',
    claim: 'credits API',
    windowMs: 60000,
    autoSchedule: false,
  });
  await confirmPayment(p.id, 'humain');
  updatePayment(p.id, {
    reversibleUntilMs: Date.now() - 1,
    verifierVerdict: { allow: true, risk: 'low', reason: 'ok', flags: [], source: 'test' },
  });

  const result = await commitIfDue(p.id);

  assert.equal(result.status, 'paid');
  assert.equal(result.molliePaymentId, `sim_${p.id}`);
  assert.equal(result.decidedBy, 'human:humain');
});

test('commitIfDue expire + verifier block -> blocked_by_verifier, jamais charge', async () => {
  const { agent } = seedAgent();
  const p = await requestReversiblePayment({
    agent,
    amountCents: 1200,
    currency: 'EUR',
    merchant: 'OpenAI',
    description: 'API',
    claim: 'wallet suspect',
    windowMs: 60000,
    autoSchedule: false,
  });
  updatePayment(p.id, {
    reversibleUntilMs: Date.now() - 1,
    verifierVerdict: { allow: false, risk: 'high', reason: 'suspect', flags: ['test'], source: 'test' },
  });

  const result = await commitIfDue(p.id);

  assert.equal(result.status, 'blocked_by_verifier');
  assert.equal(result.molliePaymentId, null);
});

test('commitIfDue expire + policy needs human -> reste en attente', async () => {
  const { agent } = seedAgent({ approvalThresholdCents: 1000 });
  const p = await requestReversiblePayment({
    agent,
    amountCents: 1200,
    currency: 'EUR',
    merchant: 'OpenAI',
    description: 'API',
    claim: 'credits API',
    windowMs: 60000,
    autoSchedule: false,
  });
  updatePayment(p.id, {
    reversibleUntilMs: Date.now() - 1,
    verifierVerdict: { allow: true, risk: 'low', reason: 'ok', flags: [], source: 'test' },
  });

  const result = await commitIfDue(p.id);

  assert.equal(result.status, 'pending_reversible');
  assert.equal(result.molliePaymentId, null);
});

test('runVerifier auto-commit si le verdict arrive apres expiration', async () => {
  const { agent } = seedAgent();
  const p = await requestReversiblePayment({
    agent,
    amountCents: 1200,
    currency: 'EUR',
    merchant: 'OpenAI',
    description: 'API',
    claim: 'credits API',
    windowMs: 60000,
    autoSchedule: false,
  });
  updatePayment(p.id, { reversibleUntilMs: Date.now() - 1 });

  await runVerifier(p.id);

  assert.equal(p.status, 'paid');
  assert.equal(p.molliePaymentId, `sim_${p.id}`);
});

test('heuristicVerdict flag un mensonge claim benin vs payee wallet', () => {
  const v = heuristicVerdict({
    amountCents: 1500,
    currency: 'EUR',
    merchant: '0xBAD wallet',
    description: 'transfer',
    claim: 'credits API',
  });

  assert.equal(v.allow, false);
  assert.ok(v.flags.some((f) => /lie|wallet|mismatch/i.test(f)));
});

test('heuristicVerdict laisse passer un paiement coherent', () => {
  const v = heuristicVerdict({
    amountCents: 1200,
    currency: 'EUR',
    merchant: 'OpenAI API',
    description: 'API credits top-up',
    claim: 'credits API',
  });

  assert.equal(v.allow, true);
});
