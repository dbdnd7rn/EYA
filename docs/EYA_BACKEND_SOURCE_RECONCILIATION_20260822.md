# EYA Backend Source Reconciliation — 2026-08-22

Status: reconciliation in progress; no production backend cutover performed.

## Current architecture decision

The production target is now explicit:

```text
EYA mobile/web clients
  -> EYA application backend on Vercel
  -> Supabase Auth/Postgres/RLS/RPC as data and identity authority

Trusted EYA payment orchestration
  -> VAC Payments on Cloudflare
  -> PayChangu
```

Vercel is the EYA application backend host. Cloudflare/VAC Payments remains the provider-facing payment authority. Vercel must not receive PayChangu provider secrets or become a second payment source of truth.

## Source locations discovered

The security pass found three materially different backend source/deployment locations:

1. `dbdnd7rn/EYA/backend` on `feat/hybrid-checkout` — the newer auditable EYA backend copy discovered during this pass.
2. `dbdnd7rn/EYA-Main-Backend` — the intended canonical backend repository, but its historical `src/server.js` copy had drifted behind `EYA/backend`.
3. Render services `EYA-backend` and `paychangu-backend` — both were configured to deploy the old `Tchoka/EYA-backend` repository.

The owner clarified that `Tchoka/EYA-backend` is an old repository that was simply never changed in Render settings. It is not an intentional third backend architecture.

Render is therefore treated as legacy infrastructure during migration, not the future EYA hosting target.

## Reconciliation branch

Canonicalization work is being performed in:

- repository: `dbdnd7rn/EYA-Main-Backend`
- branch: `reconcile/eya-main-backend-20260822`
- draft PR: `#2 Reconcile canonical EYA backend for Vercel`

The branch ports the useful newer EYA backend capabilities into modular files rather than wholesale-copying the monolithic newer `server.js`.

Security invariants already carried into the candidate include:

- bearer-derived identity for privileged operations;
- Wallet suspension and terminal Wallet route guards;
- COD remains pending until verified handoff;
- static permanent ticket-code admission is terminally disabled;
- live ticket credentials remain the admission authority;
- Admin, delivery, catalog, housing, user, ticket-read and finance modules are separated from provider payment authority.

## Vercel readiness

The reconciliation branch now contains a root `index.js` that exports the canonical Express application without calling `app.listen()`, matching Vercel's Express deployment model.

The canonical Vercel application intentionally does not register PayChangu initiation, verification, webhook or provider return-page authority. Historical `/api/paychangu/*` and `/pay/*` provider routes are terminally rejected in the Vercel candidate.

The current CI checks syntax plus security, commerce and canonical route-surface regressions.

## Payment boundary

VAC Payments on Cloudflare owns:

- PayChangu provider credentials;
- Airtel Money, TNM Mpamba, bank-transfer and card provider integration;
- provider verification;
- PayChangu webhooks;
- D1 payment ledger;
- replay/nonce/rate controls;
- signed payment outcome delivery back to the trusted EYA boundary.

EYA/Vercel owns application-specific order, delivery, ticket, organizer and fulfilment authority only.

The ticket checkout path already follows the intended trusted pattern through the Supabase `create-payment-checkout` Edge Function into VAC Payments.

A separate existing generic marketplace/food payment caller still depends on the legacy Render payment endpoint. To avoid breaking the four working rails during migration, the client configuration now separates:

- `EXPO_PUBLIC_EYA_API_URL` / `NEXT_PUBLIC_EYA_API_URL` — canonical EYA application backend URL, intended for Vercel;
- `EXPO_PUBLIC_LEGACY_PAYMENT_BACKEND_URL` / `NEXT_PUBLIC_LEGACY_PAYMENT_BACKEND_URL` — temporary generic-commerce payment bridge only.

The temporary payment variable must be removed once generic commerce is migrated to the trusted EYA -> VAC Payments Cloudflare flow. It must not be repointed to the Vercel EYA backend.

## Client environment cleanup

`lib/env.ts` now exposes `EYA_API_URL` as the canonical application-backend setting while retaining the old `PAYCHANGU_BACKEND` property only as a compatibility alias for older non-payment callers.

The generic payment client was separated onto `LEGACY_PAYMENT_BACKEND_URL` so moving the EYA application API to Vercel cannot accidentally redirect provider verification into the Vercel backend.

The app `.env` no longer contains PayChangu public/provider configuration or server-only placeholders. Provider and HMAC secrets belong only in Cloudflare/Supabase/Vercel server secret storage according to authority.

The checked-in `.env` still exists for compatibility during this branch. Long term, `.env` should be removed from version control and recreated locally from `.env.example` because the repository is public.

## Remaining migration work

1. Finish caller inventory for all historical `PAYCHANGU_BACKEND` references and move non-payment callers to `EYA_API_URL` semantics.
2. Migrate generic marketplace/food payment creation and verification from the temporary legacy Render bridge to VAC Payments on Cloudflare through a trusted server/Edge authority that derives amount/order ownership server-side.
3. Complete the stale static ticket-code client fallback removal.
4. Validate the Vercel candidate in CI and a preview deployment.
5. Configure Vercel server-only environment values without putting provider secrets there.
6. Smoke-test Admin, delivery, COD/handoff, tickets, organizer/finance and authenticated ownership behavior against the Vercel preview.
7. Change `EXPO_PUBLIC_EYA_API_URL` to the verified Vercel production URL only after those tests pass.
8. Retire the old Render/Tchoka services only after the temporary legacy payment bridge has been removed and dependency checks show no remaining callers.
9. Keep EYA-SEC-017 open; do not run a blanket production Supabase migration push until migration history is reconciled.

## Production safety

Until cutover is complete:

- do not claim the Vercel backend is live merely because the Git branch is ready;
- do not point generic payment callers at Vercel's retired `/api/paychangu/*` surface;
- do not suspend the legacy Render payment bridge while a legitimate generic-commerce caller still uses it;
- do not place PayChangu provider secrets in Vercel or the Expo bundle;
- do not weaken Wallet suspension or live rotating ticket admission rules;
- do not run a blanket production Supabase migration push while EYA-SEC-017 remains open.
