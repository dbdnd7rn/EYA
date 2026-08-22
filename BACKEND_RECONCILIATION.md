# EYA Backend Reconciliation

Date: 2026-08-22
Branch: `reconcile/eya-main-backend-20260822`

## Goal

Make `dbdnd7rn/EYA-Main-Backend` the single canonical Node/backend repository for EYA while preserving the Cloudflare VAC Payments worker and the backend security gateway.

Production Render is not changed by this branch.

## Correct base

This reconciliation is based on:

`feat/payment-architecture-v1-hybrid-checkout`

not `main`, because that branch contains the current payment/security architecture, including:

- `cloudflare/payments-worker`
- `src/secure-entry.js`
- the secure external Render entrypoint

`src/secure-entry.js` remains the externally started process and must be preserved while the inner EYA backend is reconciled.

## Source being reconciled

Newer EYA application backend copy:

`dbdnd7rn/EYA/backend` on `feat/hybrid-checkout`

## File status

### Already identical / preserved

- `.gitignore`
- `package-lock.json`
- `src/supabase.js`
- `src/secure-entry.js` — exists only in EYA-Main-Backend and must be preserved
- `cloudflare/` — shared VAC Payments infrastructure; must be preserved

### Added from EYA/backend on this reconciliation branch

- `src/foodMenu.js`
- `src/payoutDestinations.js`
- `src/tickets.js`

### Synchronized from EYA/backend on this reconciliation branch

- `src/config.js`
- `src/push.js`
- `src/paychangu.js`

### Still under controlled comparison

- `src/fulfillment.js`
- `src/server.js`
- environment example files / backend README

These files are intentionally not blindly overwritten yet because they contain payment, Wallet, COD, ticket-admission and fulfilment authority.

## Security constraints during merge

1. Wallet stays suspended.
2. `src/secure-entry.js` remains the external security boundary until an equivalent or stronger replacement is proven.
3. Cloudflare remains the VAC Payments / PayChangu provider boundary for the newer signed payment architecture.
4. Do not reactivate legacy static ticket QR/admission authority while merging old Node ticket routes.
5. Do not deploy this branch to Render until payment and actor regression tests pass.
6. Do not switch Render away from `Tchoka/EYA-backend` until the candidate canonical backend is complete and tested.
7. Do not run blanket production Supabase migration pushes while migration history reconciliation remains open.

## Next controlled steps

1. Compare `fulfillment.js` function-by-function, especially COD, payment finalization, Wallet and ticket issuance.
2. Merge the valid fulfilment changes.
3. Compare `server.js` route-by-route against `secure-entry.js` and current EYA architecture.
4. Keep valid Admin, delivery, food, housing, support, payout and notification routes.
5. Exclude or replace legacy static ticket-admission paths with the live credential architecture.
6. Run Node syntax/startup checks and actor/payment regression tests.
7. Only after passing tests, plan the Render Git-source switch to `dbdnd7rn/EYA-Main-Backend`.
