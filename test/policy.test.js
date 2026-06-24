import test from 'node:test';
import assert from 'node:assert/strict';

import { DECISION, decide } from '../policy.js';
import {
  AGENT_POLICY_TEMPLATES,
  createAccount,
  createAgent,
  createPayment,
  policyFromTemplate,
  updatePayment,
} from '../store.js';

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

test('policy templates expose deterministic spending envelopes in cents', () => {
  assert.deepEqual(Object.keys(AGENT_POLICY_TEMPLATES).sort(), [
    'developer_agent',
    'procurement_agent',
    'research_agent',
    'support_agent',
  ]);

  for (const template of Object.values(AGENT_POLICY_TEMPLATES)) {
    assert.equal(Number.isInteger(template.maxPerTxCents), true);
    assert.equal(Number.isInteger(template.maxPerDayCents), true);
    assert.equal(Number.isInteger(template.humanApprovalThresholdCents), true);
    assert.ok(template.maxPerTxCents > 0);
    assert.ok(template.maxPerDayCents >= template.maxPerTxCents);
    assert.ok(template.humanApprovalThresholdCents > 0);
    assert.ok(template.humanApprovalThresholdCents <= template.maxPerTxCents);
    assert.ok(Array.isArray(template.allowedMerchants));
  }
});

test('createAgent applies a selected policy template', () => {
  const account = createAccount({ name: `Template ${Date.now()} ${Math.random()}` });
  const agent = createAgent({
    accountId: account.id,
    name: 'Research Agent',
    policyProfile: 'research_agent',
  });

  assert.equal(agent.policyProfile, 'research_agent');
  assert.equal(agent.policy.maxPerTxCents, AGENT_POLICY_TEMPLATES.research_agent.maxPerTxCents);
  assert.equal(agent.policy.maxPerDayCents, AGENT_POLICY_TEMPLATES.research_agent.maxPerDayCents);
  assert.equal(agent.policy.approvalThresholdCents, AGENT_POLICY_TEMPLATES.research_agent.humanApprovalThresholdCents);
  assert.deepEqual(agent.policy.allowedMerchants, ['OpenRouter', 'Firecrawl', 'Browserbase']);
  assert.notEqual(agent.policy.allowedMerchants, AGENT_POLICY_TEMPLATES.research_agent.allowedMerchants);
});

test('createAgent with policy and no profile preserves custom policy defaults', () => {
  const account = createAccount({ name: `Custom ${Date.now()} ${Math.random()}` });
  const agent = createAgent({
    accountId: account.id,
    name: 'Legacy Policy Agent',
    policy: {
      maxPerTxCents: 7500,
    },
  });

  assert.equal(agent.policyProfile, 'custom');
  assert.equal(agent.policy.maxPerTxCents, 7500);
  assert.equal(agent.policy.maxPerDayCents, 20000);
  assert.equal(agent.policy.approvalThresholdCents, 10000);
  assert.deepEqual(agent.policy.allowedMerchants, []);
});

test('policyFromTemplate applies deterministic overrides without changing amount units', () => {
  const policy = policyFromTemplate('support_agent', {
    maxPerTxCents: 4500,
    humanApprovalThresholdCents: 2200,
    allowedMerchants: ['Helpdesk Sandbox'],
  });

  assert.deepEqual(policy, {
    maxPerTxCents: 4500,
    maxPerDayCents: AGENT_POLICY_TEMPLATES.support_agent.maxPerDayCents,
    approvalThresholdCents: 2200,
    allowedMerchants: ['Helpdesk Sandbox'],
  });
});
