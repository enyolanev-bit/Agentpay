# Contributing

AgentPay is early. Contributions should protect the demo while moving the trust layer toward a real open source project.

## Development

```bash
npm install
SIMULATE_PAYMENTS=1 VERIFIER_MODE=heuristic npm run dev
npm test
```

## Rules

- Keep the five-act legacy demo and the reversible wallet demo working.
- Do not make the LLM compute amounts, limits, prices, or balances.
- Store money as integer cents.
- Keep reversible intents reversible: no Mollie payment before confirm or auto-commit.
- Add or update tests when changing policy, verifier, or payment state transitions.
- Do not commit secrets, `.env`, live Mollie keys, screenshots containing private data, or generated local logs.

## Good First Areas

- API docs and examples.
- MCP client examples around the existing HTTP API wrapper.
- Persistent storage adapter.
- Idempotency and webhook retry hardening.
- More verifier evals for prompt injection and merchant/claim mismatch.
- UI polish for the mobile undo wallet.

## Pull Request Checklist

- `npm test` passes.
- Payment invariants are unchanged or explicitly tested.
- Public docs match the changed behavior.
- No real-money action is required to test the change.
