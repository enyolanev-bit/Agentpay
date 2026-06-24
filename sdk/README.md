# AgentPay JavaScript SDK

Minimal dependency-free client for the AgentPay HTTP API.

AgentPay is for agents that need to spend without holding a card. The agent
chooses an approved action, and AgentPay owns the deterministic amount, policy,
undo window, and audit trail.

```js
import { AgentPayClient } from 'agentpay';

const agentpay = new AgentPayClient({
  baseUrl: 'http://localhost:3000',
  agentToken: process.env.AGENTPAY_AGENT_TOKEN,
});

const spendOptions = await agentpay.listSpendOptions();
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
console.log(option.amount); // deterministic, server-owned amount
console.log(plan.moneyMovement); // none_until_confirm_or_commit
console.log(intent.molliePaymentId); // null until commit
```

The agent sends only `provider`. AgentPay resolves amount, merchant, claim,
policy, verifier, undo, and audit from server-side code. The catalog also
returns the spend type, description, and claim so an agent UI can show what a
top-up is before preparing an intent.
`planCreditSpend()` wraps that quote with the deterministic idempotency key for
a run and confirms that no money moves at the planning step.

Lower-level reversible intent:

```js
const intent = await agentpay.createReversibleIntent({
  amount: '18.00',
  currency: 'EUR',
  merchant: 'Bookstore',
  description: 'a book for personal growth',
  claim: 'a book to help the user grow',
  idempotencyKey: 'agent-run-123',
});

await agentpay.undoIntent(intent.intentId);
```

## Methods

- `createReversibleIntent({ amount, currency, merchant, description, claim })`
- `listCreditTopupProviders()`
- `createCreditTopupIntent({ provider })`
- `listSpendOptions()`
- `quoteCredits({ provider })`
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
