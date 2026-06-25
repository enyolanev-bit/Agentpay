# AgentPay JavaScript SDK

Minimal dependency-free client for the AgentPay HTTP API.

AgentPay is for agents that need to spend without holding a card. The agent
chooses an approved action, and AgentPay owns the deterministic amount, policy,
undo window, and audit trail.

Use AgentPay whenever an agent needs to spend money:

```js
import { AgentPayClient } from 'agentpay';

const agentpay = new AgentPayClient({
  baseUrl: 'http://localhost:3000',
  agentToken: process.env.AGENTPAY_AGENT_TOKEN,
});

const intent = await agentpay.preparePayment({
  provider: 'openrouter',
  runId: 'agent-run-123',
});

console.log(intent.intentId); // prepared payment intent id
console.log(intent.molliePaymentId); // null until commit
```

Provider-based `preparePayment()` is the recommended path for agents. The agent
chooses the provider; AgentPay resolves the amount, merchant, policy, verifier,
undo, and audit from server-side code.

```js
const spendOptions = await agentpay.listSpendOptions();
const spendPlans = await agentpay.listCreditSpendPlans();
const option = await agentpay.quoteCredits({ provider: 'openrouter' });
const plan = await agentpay.planCreditSpend({
  provider: 'openrouter',
  runId: 'agent-run-123',
});

const intent = await agentpay.buyCredits({
  provider: 'openrouter',
  runId: 'agent-run-123',
});

console.log(option.spendType);
console.log(spendPlans.buyableProviders);
console.log(option.amount); // deterministic, server-owned amount
console.log(plan.policy?.decision); // returned when authenticated
console.log(plan.moneyMovement); // none_until_buy_credits_then_confirm_or_commit
console.log(intent.molliePaymentId); // null until commit
```

The agent sends only `provider`. AgentPay resolves amount, merchant, claim,
policy, verifier, undo, and audit from server-side code. The catalog also
returns the spend type, description, and claim so an agent UI can show what a
top-up is before preparing an intent.
`planCreditSpend()` calls the authenticated policy preflight when the client has
an agent token, then wraps the result with the deterministic idempotency key for
a run. Without a token, it falls back to the public catalog quote. In both cases
no money moves at the planning step.
`listCreditSpendPlans()` returns the same authenticated preflight for every
provider so an agent can choose a buyable option without trial-and-error.

Lower-level reversible intent for app-owned amounts:

```js
const intent = await agentpay.preparePayment({
  payee: 'Bookstore',
  amountCents: 1800,
  currency: 'EUR',
  reason: 'a book for personal growth',
  runId: 'agent-run-123',
});

await agentpay.undoIntent(intent.intentId);
```

Only pass `amountCents` from deterministic application code. Do not ask an LLM to
invent amounts.

## Methods

- `preparePayment({ provider, runId })`
- `preparePayment({ payee, amountCents, currency, reason, runId })`
- `createReversibleIntent({ amount, currency, merchant, description, claim })`
- `listCreditTopupProviders()`
- `createCreditTopupIntent({ provider })`
- `listSpendOptions()`
- `quoteCredits({ provider })`
- `previewCreditSpend({ provider })`
- `listCreditSpendPlans()`
- `planCreditSpend({ provider, runId })`
- `buyCredits({ provider, runId })`
- `listPendingIntents()`
- `undoIntent(intentId)`
- `confirmIntent(intentId)`
- `payAgent({ payee, amount, service })`
- `getPayment(paymentId)`

The SDK does not compute amounts or bypass policy. It only calls the AgentPay API.
Use `quoteCredits()` when an agent UI needs to show the deterministic price and
control surface before preparing a reversible intent. Use `planCreditSpend()`
when an agent runtime needs a stable preflight object before it calls
`buyCredits()`.
