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
