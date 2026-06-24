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

Use `agentpay.prepare_payment` whenever an agent needs to spend money. Prefer
the provider path so AgentPay owns the price server-side.

| Tool | Purpose |
|---|---|
| `agentpay.prepare_payment` | Prepare a payment before money moves. Provider-based calls keep amount server-owned. |
| `agentpay.create_reversible_intent` | Prepare a payment without moving money. |
| `agentpay.list_pending_intents` | List pending reversible intents. |
| `agentpay.undo_intent` | Cancel a reversible intent before capture. |
| `agentpay.confirm_intent` | Commit a reversible intent immediately. |
| `agentpay.pay_agent` | Pay another agent by handle. |
| `agentpay.get_payment` | Read payment status. |

## Example Tool Call

```json
{
  "name": "agentpay.prepare_payment",
  "arguments": {
    "provider": "openrouter",
    "runId": "agent-run-123"
  }
}
```

Expected result: a prepared intent with `molliePaymentId:null`.

For app-owned generic amounts, pass integer `amountCents` from deterministic
application code:

```json
{
  "name": "agentpay.prepare_payment",
  "arguments": {
    "payee": "Bookstore",
    "amountCents": 1800,
    "reason": "a book for personal growth",
    "runId": "agent-run-456"
  }
}
```

Do not ask the LLM to invent `amountCents`.

## Safety

The MCP server is intentionally thin:

- it does not compute amounts;
- it does not bypass policy or verifier checks;
- it does not call Mollie directly;
- it only forwards requests to AgentPay HTTP endpoints.

This keeps all payment invariants inside the existing AgentPay backend.
