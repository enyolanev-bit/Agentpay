# Design — Reversible Agent Payments

## Problem

Autonomous agents may need to request payments for tools, credits, or services. A safe payment layer needs deterministic spending limits, auditability, and a short cancellation window before money moves.

## Goal

Demonstrate a reversible payment flow:

1. An agent requests a payment.
2. Policy checks deterministic limits.
3. AgentPay creates a `pending_reversible` intent without charging the payment provider.
4. A verifier checks the request for suspicious or inconsistent claims.
5. The user can cancel, confirm, or let the intent auto-commit after the undo window.
6. Payment execution happens only after confirmation or eligible auto-commit.

## Non-Goals

- No production authentication model.
- No refund-after-capture flow.
- No durable queue or distributed timer.
- No private, non-technical, or contact-planning material.

## Invariants

- The LLM never sets amounts, limits, provider prices, or final payment values.
- Money is represented as integer cents.
- `molliePaymentId` remains `null` until commit.
- Cancel and undo paths never call Mollie.
- Every decision is written to the audit log.

## Test Surface

- `node:test` covers policy decisions and reversible state transitions.
- Local simulation mode must run without real payment provider calls.
- Manual demos should use placeholder data only.
