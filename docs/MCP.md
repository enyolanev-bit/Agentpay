# AgentPay MCP Server

AgentPay includes a minimal MCP stdio server that exposes the HTTP API as agent tools. The HTTP API remains the source of truth; the MCP layer does not duplicate payment logic.

## Run

Start AgentPay first:

```bash
SIMULATE_PAYMENTS=1 \
VERIFIER_MODE=heuristic \
DECIDER_MODE=fallback \
MOLLIE_API_KEY=test_dummy \
BASE_URL=http://localhost:3000 \
npm run dev
```

In another process, run the MCP server:

```bash
AGENTPAY_BASE_URL=http://localhost:3000 \
AGENTPAY_AGENT_TOKEN=<AGENT_TOKEN> \
npm run mcp
```

For the demo seed, get a token from:

```bash
curl http://localhost:3000/api/demo-token
```

## Tools

| Tool | Purpose |
|---|---|
| `agentpay.create_reversible_intent` | Prepare a payment without moving money. |
| `agentpay.list_pending_intents` | List pending reversible intents. |
| `agentpay.undo_intent` | Cancel a reversible intent before capture. |
| `agentpay.confirm_intent` | Commit a reversible intent immediately. |
| `agentpay.pay_agent` | Pay another agent by handle. |
| `agentpay.get_payment` | Read payment status. |

## Example Tool Call

```json
{
  "name": "agentpay.create_reversible_intent",
  "arguments": {
    "amount": "18.00",
    "currency": "EUR",
    "merchant": "Bookstore",
    "description": "a book for personal growth",
    "claim": "a book to help the user grow",
    "idempotencyKey": "agent-run-123"
  }
}
```

Expected result: a `ReversiblePaymentIntent` with `molliePaymentId:null`.

## Safety

The MCP server is intentionally thin:

- it does not compute amounts;
- it does not bypass policy or verifier checks;
- it does not call Mollie directly;
- it only forwards requests to AgentPay HTTP endpoints.

This keeps all payment invariants inside the existing AgentPay backend.
