import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createAccount,
  createAgent,
  loadStore,
} from '../store.js';

process.env.MOLLIE_API_KEY ??= 'test_x';
process.env.SIMULATE_PAYMENTS = '1';
process.env.DECIDER_MODE = 'fallback';
process.env.VERIFIER_MODE = 'heuristic';

const { runEarningDemo } = await import('../tasks.js');

test('runEarningDemo creates paid A2A jobs and credits providers', async () => {
  await loadStore(null);
  const account = createAccount({ name: 'Earn Demo', email: 'earn@example.com' });
  createAgent({
    accountId: account.id,
    name: 'Payer',
    handle: '@payer',
    role: 'payer',
    policy: {
      maxPerTxCents: 10_000,
      maxPerDayCents: 100_000,
      approvalThresholdCents: 50_000,
      allowedMerchants: [],
    },
  });
  createAgent({
    accountId: account.id,
    name: 'Data Provider',
    handle: '@data-provider',
    role: 'provider',
    service: { label: 'Data enrichment', priceCents: 250 },
  });
  createAgent({
    accountId: account.id,
    name: 'KYC Checker',
    handle: '@kyc-checker',
    role: 'provider',
    service: { label: 'KYC verification', priceCents: 500 },
  });

  const result = await runEarningDemo({
    accountId: account.id,
    tasks: [
      'Use @data-provider for data enrichment.',
      'Use @kyc-checker for KYC verification.',
    ],
  });

  assert.equal(result.totalRuns, 2);
  assert.equal(result.paidRuns, 2);
  assert.equal(result.earnedCents, 750);
  assert.equal(result.providers.find((p) => p.handle === '@data-provider').earningsCents, 250);
  assert.equal(result.providers.find((p) => p.handle === '@kyc-checker').earningsCents, 500);
});
