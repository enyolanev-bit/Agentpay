# MCP client example

AgentPay exposes a thin MCP server so an agent runtime can prepare payments
without receiving card credentials.

Start AgentPay:

```bash
SIMULATE_PAYMENTS=1 \
VERIFIER_MODE=heuristic \
DECIDER_MODE=fallback \
MOLLIE_API_KEY=test_dummy \
BASE_URL=http://localhost:3000 \
npm run dev
```

Get a demo token:

```bash
curl http://localhost:3000/api/demo-token
```

Configure your MCP client to run:

```bash
AGENTPAY_BASE_URL=http://localhost:3000 \
AGENTPAY_AGENT_TOKEN=<AGENT_TOKEN> \
npm run mcp
```

Then call:

```json
{
  "name": "agentpay.prepare_payment",
  "arguments": {
    "provider": "openrouter",
    "runId": "agent-run-123"
  }
}
```

The agent chooses the provider. AgentPay owns price, policy, review, undo,
commit, and audit.
