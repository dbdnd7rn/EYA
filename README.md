# EYA Main Backend

Canonical EYA application backend plus shared VAC payment infrastructure.

This repository is part of the same EYA system as `dbdnd7rn/EYA`. Security and architecture decisions must be evaluated across the app, Vercel, Supabase, Cloudflare and provider boundaries.

## Production architecture

### EYA application backend — Vercel

`index.js` exports the canonical Express application from `src/server-v2.js` for Vercel.

Vercel owns EYA-specific server authority such as:
- authenticated Admin operations;
- delivery and rider operations;
- COD/order handoff;
- catalog/housing/user administration;
- ticket read operations;
- organizer/finance orchestration that is not provider payment execution.

The Vercel backend derives trusted identity from Supabase sessions and must not trust caller-supplied Admin/actor identity headers as authority.

### VAC Payments — Cloudflare

`cloudflare/payments-worker`

VAC Payments is the provider-facing payment authority for EYA and future VAC applications.

It owns:
- PayChangu provider secrets;
- Airtel Money, TNM Mpamba, bank-transfer and card provider integration;
- Cloudflare D1 provider-independent payment ledger;
- HMAC-authenticated server-to-server payment commands;
- request nonce/replay protection;
- bounded public request bodies and rate limiting;
- PayChangu webhook signature verification;
- independent provider transaction verification;
- idempotent payment-state transitions;
- payment outbox/reconciliation infrastructure.

The EYA mobile application must never receive a VAC application HMAC secret or PayChangu secret key.

Trusted payment path:

```text
EYA mobile app
  -> authenticated EYA trusted server/Edge boundary
  -> server-authoritative order reservation / amount
  -> HMAC + timestamp + nonce signed request
  -> VAC Payments Cloudflare Worker
  -> D1
  -> PayChangu
```

Provider callbacks/webhooks are not payment proof by themselves. VAC Payments independently re-verifies PayChangu transaction state before recording payment success.

## Provider-neutral Vercel rule

The canonical Vercel app does not own provider-facing PayChangu initiation, verification, webhooks or browser return pages. Historical `/api/paychangu/*` and `/pay/*` provider routes are terminally rejected by the canonical app.

A temporary generic-commerce payment caller in the app may still depend on the legacy Render endpoint during migration. That dependency is isolated behind `LEGACY_PAYMENT_BACKEND_URL` and must be removed when generic commerce is moved to VAC Payments. It must never be repointed to the Vercel backend.

## Wallet suspension

EYA Wallet and wallet-backed payments are **SUSPENDED**.

Rules:
- do not expose Wallet endpoints as active product functionality;
- do not credit or debit Wallet balances from normal user flows;
- do not offer Wallet as a checkout method;
- retain historical Wallet records only for controlled audit/reconciliation;
- delayed historical payment verification must not reactivate Wallet;
- no new backend feature may depend on Wallet until EYA explicitly reverses the suspension.

Any older comment or route that describes Wallet top-up as normal current behavior is legacy and must be treated as disabled/migration code, not product authority.

## Ticket admission rule

Permanent `ticket_code` values are support/reference identifiers only. They are not gate authority.

Admission must use the live rotating credential system with short-lived credentials, expiry/version checks and trusted atomic gate verification. The canonical backend terminally rejects the historical static ticket-code Admin check-in route.

## Backend placement policy

Use the correct trusted boundary instead of putting everything in the mobile frontend.

- **Supabase/Postgres RPC:** atomic database invariants and ownership-bound transactional state changes.
- **Supabase Edge Functions:** authenticated privileged orchestration, service-role operations and signing calls to trusted backends.
- **Vercel / EYA backend:** EYA-specific Admin, delivery, COD/handoff, catalog, user, ticket and finance orchestration.
- **Cloudflare Worker/D1:** payment-provider boundary, public webhooks/callbacks, replay/rate-limit controls and payment ledger.

Secrets, payment truth, role/workspace authorization, refunds and payouts must never be controlled by the mobile client.

## Environment placement

### Vercel
Configure only EYA application-backend secrets such as:
- `SUPABASE_URL`;
- `SUPABASE_SERVICE_ROLE_KEY`;
- `ADMIN_EMAILS` where used as a secondary allowlist;
- `EXPO_PUSH_ACCESS_TOKEN`;
- payout-destination encryption key material;
- VAC Payments application/callback credentials only where the Vercel backend is explicitly the trusted caller/receiver.

### Cloudflare
Keep provider payment secrets here:
- `PAYCHANGU_SECRET_KEY`;
- `PAYCHANGU_WEBHOOK_SECRET`;
- VAC `APP_SECRETS_JSON`;
- callback routing/secrets required by VAC Payments.

Never place server secrets in `EXPO_PUBLIC_*` or `NEXT_PUBLIC_*` variables.

## Security priorities

Audit this repository for:
- bearer/session validation and identity spoofing;
- IDOR/BOLA and privilege escalation;
- webhook spoofing and replay;
- HMAC nonce/idempotency behavior;
- unsafe callbacks/outbox replay;
- request size and rate limits;
- SQL/injection boundaries;
- SSRF/redirect/deep-link risks where applicable;
- sensitive logs/error payloads;
- dependency and secret exposure;
- race conditions around payment/fulfilment;
- denial-of-service and abuse controls.

The top-level EYA plan and finding register live in the app repository:
- `docs/EYA_MASTER_ARCHITECTURE_AND_DELIVERY_PLAN.md`
- `docs/EYA_SECURITY_AUDIT.md`
- `docs/EYA_BACKEND_SOURCE_RECONCILIATION_20260822.md`

## Local setup

The root EYA backend and Cloudflare Worker have separate configuration/runtime requirements. Use their own environment examples and package scripts.

Never commit production `.env`, `.dev.vars`, PayChangu secrets, webhook secrets, Supabase service-role keys, VAC HMAC secrets or payout-destination encryption keys.
