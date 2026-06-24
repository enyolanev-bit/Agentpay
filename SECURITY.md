# Security Policy

AgentPay handles payment permissions for AI agents. Treat every bug report about authorization, policy bypass, verifier bypass, audit integrity, or payment execution as security-sensitive.

## Supported Versions

AgentPay is currently an early MVP. Security fixes target `main`.

## Reporting a Vulnerability

Do not open a public issue for sensitive reports.

Send a private report to the maintainers with:

- a short impact summary;
- exact steps to reproduce;
- affected endpoint, file, or flow;
- whether money can move, policy can be bypassed, or audit can be forged;
- logs or screenshots if they do not contain secrets.

## Security Invariants

These invariants are load-bearing:

- The LLM never computes amounts, limits, provider prices, or final payment values.
- Money is stored as integer cents.
- `molliePaymentId` stays `null` for reversible intents until commit.
- `cancelPayment` and undo flows never call Mollie.
- Retries with the same idempotency key must not create duplicate reversible intents.
- Payment execution only happens after deterministic policy and verifier checks.
- Live payment keys and real-money operations require explicit human approval.
- `.env` and payment secrets must never be committed.

## Production Status

This repository is not production-ready yet. Before production use, AgentPay needs a SQL storage adapter, stronger auth, CSRF/session hardening for UI actions, webhook signature strategy, hosted observability, and a full security review.
