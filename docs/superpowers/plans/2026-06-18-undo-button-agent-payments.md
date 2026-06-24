# Plan — Reversible Agent Payments

This document is a public technical implementation checklist. It intentionally excludes private, non-technical, or team coordination material.

## Scope

- Store reversible payment state in memory or local JSON.
- Keep payment execution behind deterministic policy and verifier checks.
- Expose undo and confirm routes.
- Keep the mobile undo surface usable without push notifications.
- Preserve the existing API, SDK, and test suite.

## Steps

1. Add reversible payment fields: `claim`, `reversibleUntilMs`, and `pending_reversible` status.
2. Add flow helpers for request, cancel, confirm, and commit-on-expiry.
3. Extend verifier inputs with `claim` and keep fallback behavior deterministic.
4. Add public routes for reversible intents, undo, confirm, and pending intent listing.
5. Add tests for cancel-before-capture, confirm, auto-commit, idempotency, and verifier-blocked requests.
6. Keep `.env` values as placeholders and never commit live payment credentials.

## Acceptance Criteria

- `npm test` passes.
- `node --check` passes for all source files.
- Simulation mode does not call real payment providers.
- Reversible intents expose `molliePaymentId: null` before commit.
- The repository contains no private notes, personal data, real credentials, or non-technical planning material.
