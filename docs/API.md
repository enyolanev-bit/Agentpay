# AgentPay API

Base URL for local development:

```text
http://localhost:3000
```

Local MVP state is persisted to `AGENTPAY_DATA_FILE` when configured.

Agent endpoints use bearer tokens created in the dashboard.

```http
Authorization: Bearer <AGENT_TOKEN>
Content-Type: application/json
Idempotency-Key: <OPTIONAL_RETRY_KEY>
```

JavaScript SDK: [`../sdk/README.md`](../sdk/README.md).

## Create a Reversible Payment Intent

```http
POST /agent/pay-reversible
```

```json
{
  "amount": "18.00",
  "currency": "EUR",
  "merchant": "Bookstore",
  "description": "a book for personal growth",
  "claim": "a book to help the user grow",
  "idempotencyKey": "agent-run-123"
}
```

Response:

```json
{
  "type": "ReversiblePaymentIntent",
  "intentId": "pay-1",
  "status": "pending_reversible",
  "amount": "18.00",
  "currency": "EUR",
  "merchant": "Bookstore",
  "claim": "a book to help the user grow",
  "commitAfter": "2026-06-20T07:30:00.000Z",
  "molliePaymentId": null,
  "undoUrl": "http://localhost:3000/pay/pay-1/undo",
  "confirmUrl": "http://localhost:3000/pay/pay-1/confirm"
}
```

`molliePaymentId:null` is expected. Money has not moved yet.

Retries with the same `Idempotency-Key` for the same agent return the same intent instead of creating a duplicate.

## Undo an Intent

```http
POST /pay/:id/undo
```

Response:

```json
{
  "paymentId": "pay-1",
  "status": "cancelled",
  "molliePaymentId": null,
  "decidedBy": "human:Demo User"
}
```

Undo is valid before commit. It must not call Mollie.

## Confirm an Intent

```http
POST /pay/:id/confirm
```

Response:

```json
{
  "paymentId": "pay-1",
  "status": "paid",
  "molliePaymentId": "sim_pay-1",
  "decidedBy": "human:Demo User"
}
```

In simulation mode, `molliePaymentId` is synthetic. In Mollie test/live mode, it is the payment provider id.

## List Pending Reversible Intents

```http
GET /api/reversible-intents
```

Response:

```json
{
  "intents": [
    {
      "intentId": "pay-1",
      "status": "pending_reversible",
      "amount": "18.00",
      "merchant": "Bookstore",
      "molliePaymentId": null
    }
  ]
}
```

## Credit Top-Up Spend Control

Agents can request a credit top-up by provider slug. The
agent does not send amount, merchant, or claim. AgentPay resolves those from a
deterministic server catalog before policy, verifier, undo, and audit run.

```http
GET /agent/credit-topups
```

Response:

```json
{
  "providers": [
    {
      "provider": "openrouter",
      "merchant": "OpenRouter",
      "amount": "25.00",
      "currency": "EUR",
      "spendType": "inference_credits",
      "description": "Inference credits top-up",
      "claim": "OpenRouter inference credits for agent model calls"
    }
  ]
}
```

```http
POST /agent/credit-topup
```

```json
{
  "provider": "openrouter"
}
```

Response:

```json
{
  "type": "CreditTopupIntent",
  "provider": "openrouter",
  "spendType": "inference_credits",
  "description": "Inference credits top-up",
  "claim": "OpenRouter inference credits for agent model calls",
  "reason": "agent needs more inference credits to continue routed model work",
  "intentId": "pay-1",
  "status": "pending_reversible",
  "amount": "25.00",
  "merchant": "OpenRouter",
  "molliePaymentId": null
}
```

Supported sandbox providers: `openrouter`, `firecrawl`, `browserbase`.

## Agent-to-Agent Payment

```http
POST /agent/pay-agent
```

```json
{
  "payee": "@data-provider",
  "amount": "2.50",
  "service": "Lead enrichment"
}
```

The provider price should come from provider metadata in future production flows. The LLM should not be trusted to set final pricing.

## Legacy Immediate Merchant Payment

```http
POST /agent/pay
```

This endpoint exists for the original demo flow. New agent integrations should prefer `/agent/pay-reversible`.

## MCP Mapping

The MCP server should be a thin wrapper over the HTTP API:

| MCP tool | HTTP operation |
|---|---|
| `agentpay.create_reversible_intent` | `POST /agent/pay-reversible` |
| `agentpay.create_credit_topup_intent` | `POST /agent/credit-topup` |
| `agentpay.list_pending_intents` | `GET /api/reversible-intents` |
| `agentpay.undo_intent` | `POST /pay/:id/undo` |
| `agentpay.confirm_intent` | `POST /pay/:id/confirm` |
| `agentpay.pay_agent` | `POST /agent/pay-agent` |

Keep the HTTP API as the source of truth. MCP should not duplicate payment logic.

Implementation notes: [`docs/MCP.md`](MCP.md).
