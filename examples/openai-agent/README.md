# OpenAI agent example

Use AgentPay whenever an agent needs to spend money. Expose a small tool that
prepares a payment, then let AgentPay handle policy, review, undo, commit, and
audit.

```js
import { AgentPayClient } from 'agentpay';

const agentpay = new AgentPayClient({
  baseUrl: process.env.AGENTPAY_BASE_URL ?? 'http://localhost:3000',
  agentToken: process.env.AGENTPAY_AGENT_TOKEN,
});

export async function preparePaymentForAgent({ provider, runId }) {
  return agentpay.preparePayment({
    provider,
    runId,
  });
}
```

Register `preparePaymentForAgent` as an agent tool in your OpenAI Agents SDK
runtime. Prefer `provider` for server-owned prices. Only pass `amountCents` from
deterministic application code, not from model output.
