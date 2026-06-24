import { AgentPayClient } from '../../sdk/client.js';

const baseUrl = process.env.AGENTPAY_BASE_URL ?? 'http://localhost:3000';
const agentToken = process.env.AGENTPAY_AGENT_TOKEN;

if (!agentToken) {
  console.error('Missing AGENTPAY_AGENT_TOKEN. Get one with: curl http://localhost:3000/api/demo-token');
  process.exit(1);
}

const agentpay = new AgentPayClient({ baseUrl, agentToken });

const runId = process.env.AGENTPAY_RUN_ID ?? `example-${Date.now()}`;
const catalog = await agentpay.listSpendOptions();
const provider = process.env.AGENTPAY_CREDIT_PROVIDER ?? 'openrouter';
const quote = await agentpay.quoteCredits({ provider });

console.log('Available deterministic spend options:');
console.log(JSON.stringify(catalog.providers.map((option) => ({
  provider: option.provider,
  amount: option.amount,
  merchant: option.merchant,
})), null, 2));

console.log('Selected spend option:');
console.log(JSON.stringify({
  provider: quote.provider,
  amount: quote.amount,
  merchant: quote.merchant,
  spendType: quote.spendType,
}, null, 2));

const intent = await agentpay.buyCredits({ provider, runId });

console.log('Prepared agent credit top-up intent:');
console.log(JSON.stringify({
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
