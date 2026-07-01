import test from 'node:test';
import assert from 'node:assert/strict';

import { AgentPayClient, AgentPayError } from '../sdk/client.js';

const response = (body, { status = 200 } = {}) => ({
  ok: status >= 200 && status < 300,
  status,
  text: async () => JSON.stringify(body),
});

test('createReversibleIntent calls API with bearer token and preserves null molliePaymentId', async () => {
  const calls = [];
  const client = new AgentPayClient({
    baseUrl: 'http://agentpay.test',
    agentToken: 'tok_demo',
    fetch: async (url, init) => {
      calls.push({ url: String(url), init });
      return response({
        type: 'ReversiblePaymentIntent',
        intentId: 'pay-1',
        status: 'pending_reversible',
        molliePaymentId: null,
      });
    },
  });

  const intent = await client.createReversibleIntent({
    amount: '18.00',
    merchant: 'Bookstore',
    description: 'a book for personal growth',
    idempotencyKey: 'intent-123',
  });

  assert.equal(intent.molliePaymentId, null);
  assert.equal(calls[0].url, 'http://agentpay.test/agent/pay-reversible');
  assert.equal(calls[0].init.method, 'POST');
  assert.equal(calls[0].init.headers.Authorization, 'Bearer tok_demo');
  assert.equal(calls[0].init.headers['Idempotency-Key'], 'intent-123');
  assert.deepEqual(JSON.parse(calls[0].init.body), {
    amount: '18.00',
    currency: 'EUR',
    merchant: 'Bookstore',
    description: 'a book for personal growth',
    claim: 'a book for personal growth',
  });
});

test('preparePayment with provider keeps amount server-owned', async () => {
  const calls = [];
  const client = new AgentPayClient({
    baseUrl: 'http://agentpay.test',
    agentToken: 'tok_demo',
    fetch: async (url, init) => {
      calls.push({ url: String(url), init });
      return response({
        type: 'CreditTopupIntent',
        provider: 'openrouter',
        amount: '25.00',
        merchant: 'OpenRouter',
        molliePaymentId: null,
      });
    },
  });

  const intent = await client.preparePayment({ provider: 'OpenRouter', runId: 'run-prepare-1' });

  assert.equal(intent.type, 'CreditTopupIntent');
  assert.equal(calls[0].url, 'http://agentpay.test/agent/credit-topup');
  assert.equal(calls[0].init.headers.Authorization, 'Bearer tok_demo');
  assert.equal(calls[0].init.headers['Idempotency-Key'], 'agentpay:run-prepare-1:credits:openrouter');
  assert.deepEqual(JSON.parse(calls[0].init.body), { provider: 'OpenRouter' });
});

test('preparePayment maps app-owned cents to a reversible intent', async () => {
  const calls = [];
  const client = new AgentPayClient({
    baseUrl: 'http://agentpay.test',
    agentToken: 'tok_demo',
    fetch: async (url, init) => {
      calls.push({ url: String(url), init });
      return response({
        type: 'ReversiblePaymentIntent',
        intentId: 'pay-2',
        status: 'pending_reversible',
        molliePaymentId: null,
      });
    },
  });

  const intent = await client.preparePayment({
    payee: 'OpenRouter',
    amountCents: 2500,
    reason: 'Buy inference credits',
    runId: 'run-prepare-2',
  });

  assert.equal(intent.type, 'ReversiblePaymentIntent');
  assert.equal(intent.molliePaymentId, null);
  assert.equal(calls[0].url, 'http://agentpay.test/agent/pay-reversible');
  assert.equal(calls[0].init.headers['Idempotency-Key'], 'agentpay:run-prepare-2:payment:openrouter');
  assert.deepEqual(JSON.parse(calls[0].init.body), {
    amount: '25.00',
    currency: 'EUR',
    merchant: 'OpenRouter',
    description: 'Buy inference credits',
    claim: 'Buy inference credits',
  });
});

test('preparePayment rejects agent-provided amount for deterministic providers', async () => {
  const client = new AgentPayClient({ fetch: async () => response({}) });

  await assert.rejects(
    () => client.preparePayment({ provider: 'openrouter', amountCents: 2500 }),
    (err) => {
      assert.ok(err instanceof AgentPayError);
      assert.equal(err.message, 'amountCents is not accepted when provider is used; AgentPay resolves provider prices server-side.');
      return true;
    },
  );
});

test('preparePayment requires positive integer cents for generic intents', async () => {
  const client = new AgentPayClient({ fetch: async () => response({}) });

  await assert.rejects(
    () => client.preparePayment({ payee: 'OpenRouter', amountCents: 25.5, reason: 'credits' }),
    (err) => {
      assert.ok(err instanceof AgentPayError);
      assert.equal(err.message, 'amountCents must be a positive safe integer.');
      return true;
    },
  );
});

test('undoIntent posts to undo endpoint without agent token requirement', async () => {
  const calls = [];
  const client = new AgentPayClient({
    baseUrl: 'http://agentpay.test',
    fetch: async (url, init) => {
      calls.push({ url: String(url), init });
      return response({ paymentId: 'pay-1', status: 'cancelled', molliePaymentId: null });
    },
  });

  const result = await client.undoIntent('pay-1');

  assert.equal(result.status, 'cancelled');
  assert.equal(result.molliePaymentId, null);
  assert.equal(calls[0].url, 'http://agentpay.test/pay/pay-1/undo');
  assert.equal(calls[0].init.method, 'POST');
});

test('createCreditTopupIntent posts provider only so server owns amount and merchant', async () => {
  const calls = [];
  const client = new AgentPayClient({
    baseUrl: 'http://agentpay.test',
    agentToken: 'tok_demo',
    fetch: async (url, init) => {
      calls.push({ url: String(url), init });
      return response({
        type: 'CreditTopupIntent',
        provider: 'openrouter',
        amount: '25.00',
        merchant: 'OpenRouter',
        molliePaymentId: null,
      }, { status: 201 });
    },
  });

  const intent = await client.createCreditTopupIntent({
    provider: 'openrouter',
    idempotencyKey: 'topup-123',
  });

  assert.equal(intent.type, 'CreditTopupIntent');
  assert.equal(calls[0].url, 'http://agentpay.test/agent/credit-topup');
  assert.equal(calls[0].init.method, 'POST');
  assert.equal(calls[0].init.headers.Authorization, 'Bearer tok_demo');
  assert.equal(calls[0].init.headers['Idempotency-Key'], 'topup-123');
  assert.deepEqual(JSON.parse(calls[0].init.body), { provider: 'openrouter' });
});

test('listCreditTopupProviders reads deterministic spend catalog', async () => {
  const calls = [];
  const client = new AgentPayClient({
    baseUrl: 'http://agentpay.test',
    fetch: async (url, init) => {
      calls.push({ url: String(url), init });
      return response({ providers: [{ provider: 'openrouter', amount: '25.00' }] });
    },
  });

  const catalog = await client.listCreditTopupProviders();

  assert.equal(catalog.providers[0].provider, 'openrouter');
  assert.equal(calls[0].url, 'http://agentpay.test/agent/credit-topups');
  assert.equal(calls[0].init.method, 'GET');
});

test('listSpendOptions is an agent-facing alias for deterministic spend catalog', async () => {
  const calls = [];
  const client = new AgentPayClient({
    baseUrl: 'http://agentpay.test',
    fetch: async (url, init) => {
      calls.push({ url: String(url), init });
      return response({ providers: [{ provider: 'firecrawl', amount: '16.00' }] });
    },
  });

  const catalog = await client.listSpendOptions();

  assert.equal(catalog.providers[0].provider, 'firecrawl');
  assert.equal(calls[0].url, 'http://agentpay.test/agent/credit-topups');
});

test('buyCredits creates deterministic idempotency key from agent run id', async () => {
  const calls = [];
  const client = new AgentPayClient({
    baseUrl: 'http://agentpay.test',
    agentToken: 'tok_demo',
    fetch: async (url, init) => {
      calls.push({ url: String(url), init });
      return response({
        type: 'CreditTopupIntent',
        provider: 'openrouter',
        amount: '25.00',
        merchant: 'OpenRouter',
        molliePaymentId: null,
      });
    },
  });

  const intent = await client.buyCredits({ provider: 'OpenRouter', runId: 'run-456' });

  assert.equal(intent.type, 'CreditTopupIntent');
  assert.equal(calls[0].url, 'http://agentpay.test/agent/credit-topup');
  assert.equal(calls[0].init.headers.Authorization, 'Bearer tok_demo');
  assert.equal(calls[0].init.headers['Idempotency-Key'], 'agentpay:run-456:credits:openrouter');
  assert.deepEqual(JSON.parse(calls[0].init.body), { provider: 'OpenRouter' });
});

test('quoteCredits returns a deterministic spend option without creating intent', async () => {
  const calls = [];
  const client = new AgentPayClient({
    baseUrl: 'http://agentpay.test',
    fetch: async (url, init) => {
      calls.push({ url: String(url), init });
      return response({
        providers: [
          {
            provider: 'openrouter',
            amount: '25.00',
            merchant: 'OpenRouter',
            spendType: 'inference_credits',
          },
        ],
      });
    },
  });

  const option = await client.quoteCredits({ provider: ' OpenRouter ' });

  assert.equal(option.provider, 'openrouter');
  assert.equal(option.amount, '25.00');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'http://agentpay.test/agent/credit-topups');
  assert.equal(calls[0].init.method, 'GET');
});

test('quoteCredits rejects unknown providers with allowed options', async () => {
  const client = new AgentPayClient({
    fetch: async () => response({ providers: [{ provider: 'firecrawl' }] }),
  });

  await assert.rejects(
    () => client.quoteCredits({ provider: 'stripe' }),
    (err) => {
      assert.ok(err instanceof AgentPayError);
      assert.equal(err.status, 400);
      assert.equal(err.message, 'unknown credit provider: stripe');
      assert.deepEqual(err.body.allowedProviders, ['firecrawl']);
      return true;
    },
  );
});

test('planCreditSpend returns a no-money-moved spend plan for an agent run', async () => {
  const client = new AgentPayClient({
    fetch: async () => response({
      providers: [
        {
          provider: 'browserbase',
          amount: '20.00',
          currency: 'EUR',
          merchant: 'Browserbase',
          spendType: 'browser_automation_credits',
          description: 'Browser automation credits top-up',
          claim: 'Browserbase browser hours, search calls, fetch calls, and model tokens',
        },
      ],
    }),
  });

  const plan = await client.planCreditSpend({ provider: 'BrowserBase', runId: 'run-789' });

  assert.equal(plan.type, 'CreditSpendPlan');
  assert.equal(plan.provider, 'browserbase');
  assert.equal(plan.amount, '20.00');
  assert.equal(plan.spendType, 'browser_automation_credits');
  assert.equal(plan.description, 'Browser automation credits top-up');
  assert.equal(plan.idempotencyKey, 'agentpay:run-789:credits:browserbase');
  assert.equal(plan.nextAction, 'buyCredits');
  assert.equal(plan.moneyMovement, 'none_until_confirm_or_commit');
  assert.equal(plan.molliePaymentId, null);
});

test('planCreditSpend uses authenticated policy preview when an agent token is available', async () => {
  const calls = [];
  const client = new AgentPayClient({
    baseUrl: 'http://agentpay.test',
    agentToken: 'tok_demo',
    fetch: async (url, init) => {
      calls.push({ url: String(url), init });
      return response({
        type: 'CreditSpendPlan',
        provider: 'openrouter',
        amount: '25.00',
        currency: 'EUR',
        merchant: 'OpenRouter',
        spendType: 'inference_credits',
        policy: { decision: 'AUTO_APPROVE', reasons: ['within budget'] },
        budget: {
          maxPerTx: '25.00',
          maxPerDay: '100.00',
          approvalThreshold: '15.00',
          spentToday: '0.00',
          remainingTodayBefore: '100.00',
          remainingTodayAfter: '75.00',
          allowedMerchants: ['OpenRouter'],
        },
        nextAction: 'buyCredits',
        moneyMovement: 'none_until_buy_credits_then_confirm_or_commit',
        molliePaymentId: null,
      });
    },
  });

  const plan = await client.planCreditSpend({ provider: 'OpenRouter', runId: 'run-999' });

  assert.equal(plan.provider, 'openrouter');
  assert.equal(plan.policy.decision, 'AUTO_APPROVE');
  assert.equal(plan.budget.remainingTodayAfter, '75.00');
  assert.equal(plan.idempotencyKey, 'agentpay:run-999:credits:openrouter');
  assert.equal(calls[0].url, 'http://agentpay.test/agent/credit-plan');
  assert.equal(calls[0].init.method, 'POST');
  assert.equal(calls[0].init.headers.Authorization, 'Bearer tok_demo');
  assert.deepEqual(JSON.parse(calls[0].init.body), { provider: 'OpenRouter' });
});

test('listCreditSpendPlans fetches authenticated policy previews for all providers', async () => {
  const calls = [];
  const client = new AgentPayClient({
    baseUrl: 'http://agentpay.test',
    agentToken: 'tok_demo',
    fetch: async (url, init) => {
      calls.push({ url: String(url), init });
      return response({
        type: 'CreditSpendPlanList',
        plans: [
          {
            type: 'CreditSpendPlan',
            provider: 'openrouter',
            amount: '25.00',
            spendType: 'inference_credits',
            policy: { decision: 'AUTO_APPROVE', reasons: ['within budget'] },
            budget: { remainingTodayAfter: '75.00' },
            nextAction: 'buyCredits',
            moneyMovement: 'none_until_buy_credits_then_confirm_or_commit',
            molliePaymentId: null,
          },
        ],
        buyableProviders: ['openrouter'],
        moneyMovement: 'none_until_buy_credits_then_confirm_or_commit',
      });
    },
  });

  const catalog = await client.listCreditSpendPlans();

  assert.equal(catalog.type, 'CreditSpendPlanList');
  assert.equal(catalog.plans[0].provider, 'openrouter');
  assert.equal(catalog.plans[0].policy.decision, 'AUTO_APPROVE');
  assert.equal(catalog.buyableProviders[0], 'openrouter');
  assert.equal(calls[0].url, 'http://agentpay.test/agent/credit-plans');
  assert.equal(calls[0].init.method, 'GET');
  assert.equal(calls[0].init.headers.Authorization, 'Bearer tok_demo');
});

test('pickCreditSpendPlan returns the first buyable non-rejected plan', async () => {
  const client = new AgentPayClient({
    agentToken: 'tok_demo',
    fetch: async () => response({
      type: 'CreditSpendPlanList',
      plans: [
        {
          provider: 'openrouter',
          spendType: 'inference_credits',
          nextAction: 'choose_another_provider_or_policy',
          policy: { decision: 'REJECTED' },
        },
        {
          provider: 'firecrawl',
          spendType: 'web_data_credits',
          nextAction: 'buyCredits',
          policy: { decision: 'AUTO_APPROVE' },
          molliePaymentId: null,
        },
      ],
      buyableProviders: ['firecrawl'],
    }),
  });

  const plan = await client.pickCreditSpendPlan();

  assert.equal(plan.provider, 'firecrawl');
  assert.equal(plan.spendType, 'web_data_credits');
  assert.equal(plan.molliePaymentId, null);
});

test('pickCreditSpendPlan can filter by spend type', async () => {
  const client = new AgentPayClient({
    fetch: async () => response({
      plans: [
        {
          provider: 'openrouter',
          spendType: 'inference_credits',
          nextAction: 'buyCredits',
          policy: { decision: 'AUTO_APPROVE' },
        },
        {
          provider: 'browserbase',
          spendType: 'browser_automation_credits',
          nextAction: 'buyCredits',
          policy: { decision: 'AUTO_APPROVE' },
        },
      ],
      buyableProviders: ['openrouter', 'browserbase'],
    }),
  });

  const plan = await client.pickCreditSpendPlan({ spendType: 'browser_automation_credits' });

  assert.equal(plan.provider, 'browserbase');
});

test('pickCreditSpendPlan rejects when no matching plan is buyable', async () => {
  const client = new AgentPayClient({
    fetch: async () => response({
      plans: [
        {
          provider: 'openrouter',
          spendType: 'inference_credits',
          nextAction: 'choose_another_provider_or_policy',
          policy: { decision: 'REJECTED' },
        },
      ],
      buyableProviders: [],
    }),
  });

  await assert.rejects(
    () => client.pickCreditSpendPlan({ spendType: 'browser_automation_credits' }),
    (err) => {
      assert.ok(err instanceof AgentPayError);
      assert.equal(err.status, 409);
      assert.equal(err.message, 'no buyable credit spend plan is available.');
      assert.deepEqual(err.body.buyableProviders, []);
      return true;
    },
  );
});

test('summarizeCreditSpendControl returns selected provider, blocked providers, and budget', async () => {
  const calls = [];
  const client = new AgentPayClient({
    baseUrl: 'http://agentpay.test',
    agentToken: 'tok_demo',
    fetch: async (url, init) => {
      calls.push({ url: String(url), init });
      return response({
        type: 'CreditSpendPlanList',
        plans: [
          {
            provider: 'openrouter',
            spendType: 'inference_credits',
            nextAction: 'choose_another_provider_or_policy',
            policy: { decision: 'REJECTED' },
            budget: { remainingTodayAfter: '0.00' },
          },
          {
            provider: 'firecrawl',
            spendType: 'web_data_credits',
            nextAction: 'buyCredits',
            policy: { decision: 'AUTO_APPROVE' },
            budget: {
              maxPerDay: '100.00',
              spentToday: '20.00',
              remainingTodayAfter: '64.00',
            },
            molliePaymentId: null,
          },
        ],
        buyableProviders: ['firecrawl'],
        moneyMovement: 'none_until_buy_credits_then_confirm_or_commit',
      });
    },
  });

  const summary = await client.summarizeCreditSpendControl();

  assert.equal(summary.type, 'CreditSpendControlSummary');
  assert.equal(summary.totalPlans, 2);
  assert.deepEqual(summary.buyableProviders, ['firecrawl']);
  assert.deepEqual(summary.blockedProviders, ['openrouter']);
  assert.equal(summary.selectedProvider, 'firecrawl');
  assert.equal(summary.selectedPlan.molliePaymentId, null);
  assert.equal(summary.budget.remainingTodayAfter, '64.00');
  assert.equal(summary.nextAction, 'buyCredits');
  assert.equal(summary.moneyMovement, 'none_until_buy_credits_then_confirm_or_commit');
  assert.equal(summary.molliePaymentId, null);
  assert.equal(calls[0].url, 'http://agentpay.test/agent/credit-plans');
  assert.equal(calls[0].init.headers.Authorization, 'Bearer tok_demo');
});

test('summarizeCreditSpendControl can focus on one spend type', async () => {
  const client = new AgentPayClient({
    fetch: async () => response({
      plans: [
        {
          provider: 'openrouter',
          spendType: 'inference_credits',
          nextAction: 'buyCredits',
          policy: { decision: 'AUTO_APPROVE' },
        },
        {
          provider: 'browserbase',
          spendType: 'browser_automation_credits',
          nextAction: 'buyCredits',
          policy: { decision: 'AUTO_APPROVE' },
          budget: { remainingTodayAfter: '80.00' },
        },
      ],
      buyableProviders: ['openrouter', 'browserbase'],
    }),
  });

  const summary = await client.summarizeCreditSpendControl({
    spendType: 'browser_automation_credits',
  });

  assert.equal(summary.totalPlans, 1);
  assert.equal(summary.spendType, 'browser_automation_credits');
  assert.deepEqual(summary.buyableProviders, ['browserbase']);
  assert.deepEqual(summary.blockedProviders, []);
  assert.equal(summary.selectedProvider, 'browserbase');
  assert.equal(summary.budget.remainingTodayAfter, '80.00');
});

test('summarizeCreditSpendControl reports policy action when no plan is buyable', async () => {
  const client = new AgentPayClient({
    fetch: async () => response({
      plans: [
        {
          provider: 'openrouter',
          spendType: 'inference_credits',
          nextAction: 'choose_another_provider_or_policy',
          policy: { decision: 'REJECTED' },
        },
      ],
      buyableProviders: [],
    }),
  });

  const summary = await client.summarizeCreditSpendControl();

  assert.equal(summary.selectedPlan, null);
  assert.equal(summary.selectedProvider, null);
  assert.deepEqual(summary.buyableProviders, []);
  assert.deepEqual(summary.blockedProviders, ['openrouter']);
  assert.equal(summary.nextAction, 'choose_another_provider_or_policy');
  assert.equal(summary.molliePaymentId, null);
});

test('previewCreditSpend requires a provider', async () => {
  const client = new AgentPayClient({ fetch: async () => response({}) });

  await assert.rejects(
    () => client.previewCreditSpend(),
    (err) => {
      assert.ok(err instanceof AgentPayError);
      assert.equal(err.message, 'provider is required.');
      return true;
    },
  );
});

test('buyCredits requires a provider', async () => {
  const client = new AgentPayClient({ fetch: async () => response({}) });

  await assert.rejects(
    () => client.buyCredits({ runId: 'run-456' }),
    (err) => {
      assert.ok(err instanceof AgentPayError);
      assert.equal(err.message, 'provider is required.');
      return true;
    },
  );
});

test('throws AgentPayError on non-2xx responses', async () => {
  const client = new AgentPayClient({
    fetch: async () => response({ error: 'token agent invalide' }, { status: 401 }),
  });

  await assert.rejects(
    () => client.createReversibleIntent({ amount: '18.00', merchant: 'Bookstore', description: 'book' }),
    (err) => {
      assert.ok(err instanceof AgentPayError);
      assert.equal(err.status, 401);
      assert.equal(err.message, 'token agent invalide');
      return true;
    },
  );
});
