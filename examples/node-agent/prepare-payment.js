import { AgentPayClient } from '../../sdk/client.js';

const baseUrl = process.env.AGENTPAY_BASE_URL ?? 'http://localhost:3000';
const agentToken = process.env.AGENTPAY_AGENT_TOKEN;

if (!agentToken) {
  console.error('Missing AGENTPAY_AGENT_TOKEN. Get one with: curl http://localhost:3000/api/demo-token');
  process.exit(1);
}

const agentpay = new AgentPayClient({ baseUrl, agentToken });

const runId = process.env.AGENTPAY_RUN_ID ?? `agent-run-${Date.now()}`;

// Use AgentPay whenever an agent needs to spend money.
// The recommended path is provider-based: the agent chooses what it needs,
// while AgentPay owns price, merchant, policy, review, undo, and audit.
const intent = await agentpay.preparePayment({
  provider: process.env.AGENTPAY_CREDIT_PROVIDER ?? 'openrouter',
  runId,
});

console.log('Prepared payment intent:');
console.log(JSON.stringify({
  type: intent.type,
  intentId: intent.intentId,
  status: intent.status,
  provider: intent.provider,
  amount: intent.amount,
  merchant: intent.merchant,
  molliePaymentId: intent.molliePaymentId,
  undoUrl: intent.undoUrl,
  confirmUrl: intent.confirmUrl,
}, null, 2));

if (process.env.AGENTPAY_EXAMPLE_CONFIRM === '1') {
  const confirmed = await agentpay.confirmIntent(intent.intentId);
  console.log('Confirmed:');
  console.log(JSON.stringify(confirmed, null, 2));
} else {
  const cancelled = await agentpay.undoIntent(intent.intentId);
  console.log('Cancelled for safe demo cleanup:');
  console.log(JSON.stringify(cancelled, null, 2));
}
