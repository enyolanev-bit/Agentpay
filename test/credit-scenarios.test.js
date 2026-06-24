import test from 'node:test';
import assert from 'node:assert/strict';

import { creditTopupOption, creditTopupProviders, getCreditTopupScenario } from '../credit-scenarios.js';

test('credit top-up catalog exposes deterministic provider prices', () => {
  const providers = creditTopupProviders();

  assert.ok(providers.length >= 3);
  assert.deepEqual(
    providers.map((scenario) => scenario.provider).sort(),
    ['browserbase', 'firecrawl', 'openrouter'],
  );
  assert.equal(getCreditTopupScenario('openrouter').amountCents, 2500);
  assert.equal(getCreditTopupScenario(' OpenRouter ').merchant, 'OpenRouter');
  assert.equal(getCreditTopupScenario('unknown'), null);
});

test('credit top-up catalog exposes neutral technical fields only', () => {
  const openrouter = getCreditTopupScenario('openrouter');
  const firecrawl = getCreditTopupScenario('firecrawl');
  const browserbase = getCreditTopupScenario('browserbase');

  assert.equal(openrouter.spendType, 'inference_credits');
  assert.equal(firecrawl.spendType, 'web_data_credits');
  assert.equal(browserbase.spendType, 'browser_automation_credits');
  assert.match(openrouter.claim, /inference credits/);
  assert.equal(firecrawl.amountCents, 1600);
  assert.equal(browserbase.amountCents, 2000);

  // Regression guard: no private or non-technical field may leak back into the catalog.
  const banned = ['privateNotes', 'contactPlan', 'sensitiveContext', 'personalData', 'nonTechnicalPlan'];
  for (const scenario of [openrouter, firecrawl, browserbase]) {
    for (const field of banned) {
      assert.equal(scenario[field], undefined, `scenario must not expose ${field}`);
    }
  }
});

test('credit top-up option serializes only neutral technical fields', () => {
  const option = creditTopupOption(getCreditTopupScenario('browserbase'));

  assert.deepEqual(Object.keys(option), [
    'provider',
    'merchant',
    'amount',
    'currency',
    'spendType',
    'description',
    'claim',
  ]);
  assert.equal(option.amount, '20.00');
  assert.equal(option.merchant, 'Browserbase');
  assert.equal(option.spendType, 'browser_automation_credits');
});
