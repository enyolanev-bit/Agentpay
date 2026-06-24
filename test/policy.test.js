import test from 'node:test';
import assert from 'node:assert/strict';

import { DECISION, decide } from '../policy.js';
import { createAccount, createAgent, createPayment, updatePayment } from '../store.js';

function makeAgent(policy = {}) {
  const account = createAccount({ name: `Test ${Date.now()} ${Math.random()}` });
  const agent = createAgent({
    accountId: account.id,
    name: 'Policy Test Agent',
    policy: {
      maxPerTxCents: 10_000,
      maxPerDayCents: 20_000,
      approvalThresholdCents: 5_000,
      allowedMerchants: [],
      ...policy,
    },
  });
  return { account, agent };
}

test('decide AUTO_APPROVE quand la demande est dans la policy', () => {
  const { agent } = makeAgent();
  const result = decide(agent, {
    amountCents: 2_500,
    currency: 'EUR',
    merchant: 'OpenAI',
    description: 'Credits API',
  });

  assert.equal(result.decision, DECISION.AUTO_APPROVE);
  assert.ok(result.reasons.length > 0);
});

test('decide NEEDS_HUMAN au-dessus du seuil mais sous les plafonds', () => {
  const { agent } = makeAgent();
  const result = decide(agent, {
    amountCents: 6_000,
    currency: 'EUR',
    merchant: 'AWS',
    description: 'Facture infra',
  });

  assert.equal(result.decision, DECISION.NEEDS_HUMAN);
  assert.match(result.reasons.join(' '), /validation humaine requise/);
});

test('decide REJECTED si le plafond par transaction est depasse', () => {
  const { agent } = makeAgent();
  const result = decide(agent, {
    amountCents: 10_001,
    currency: 'EUR',
    merchant: 'AWS',
    description: 'Facture infra',
  });

  assert.equal(result.decision, DECISION.REJECTED);
  assert.match(result.reasons.join(' '), /plafond par transaction/);
});

test('decide REJECTED si le plafond journalier est depasse', () => {
  const { account, agent } = makeAgent({ maxPerDayCents: 10_000 });
  const previous = createPayment({
    agentId: agent.id,
    accountId: account.id,
    amountCents: 9_000,
    currency: 'EUR',
    merchant: 'OpenAI',
    description: 'Deja paye',
  });
  updatePayment(previous.id, { status: 'paid' });

  const result = decide(agent, {
    amountCents: 1_500,
    currency: 'EUR',
    merchant: 'OpenAI',
    description: 'Nouvelle demande',
  });

  assert.equal(result.decision, DECISION.REJECTED);
  assert.match(result.reasons.join(' '), /Plafond journalier depasse/);
});

test('decide REJECTED si le marchand est hors allowlist', () => {
  const { agent } = makeAgent({ allowedMerchants: ['OpenAI'] });
  const result = decide(agent, {
    amountCents: 2_500,
    currency: 'EUR',
    merchant: 'AWS',
    description: 'Facture infra',
  });

  assert.equal(result.decision, DECISION.REJECTED);
  assert.match(result.reasons.join(' '), /absent de l'allowlist/);
});
