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
- `cloudflare/` — shared VAC Payments infrastructure; must be preserved

### Added from EYA/backend on this reconciliation branch

- `src/foodMenu.js`
- `src/payoutDestinations.js`
- `src/tickets.js`

### Synchronized from EYA/backend on this reconciliation branch

- `src/config.js`
- `src/push.js`
- `src/paychangu.js`
- `env.example`

### Reconciled with additional security corrections

- `src/fulfillment.js`
- `src/secure-entry.js`

The newer fulfilment changes were classified before merging. The branch now includes:

- EYA project ownership (`project: "eya"` instead of the older Pa-Level default);
- food customization price/name snapshots from server-side catalog data;
- ticket-order fulfilment hook after trusted payment verification;
- COD orders created with `payment_status = pending` and a pending cash payment;
- COD becomes paid only at authorized handoff verification;
- delivery must reach `arriving` before first handoff verification;
- repeated handoff verification is idempotent;
- historical Wallet top-up verification records reconciliation metadata/events but does not credit a Wallet balance;
- Wallet verification returns `finalized: false` because payment verification is not Wallet fulfilment;
- direct Node Wallet checkout export is hard-disabled and throws `Wallet services are suspended.` even if an internal caller somehow bypasses the HTTP gateway.

Legacy Wallet helper functions remain physically present inside `fulfillment.js` only because the old inner server and historical code are still being reconciled. The externally reachable gateway blocks Wallet, and the exported checkout function cannot execute Wallet mutations. Remove the dead helpers after `server.js` no longer references legacy Wallet behavior.

### Security policy/regression files added

- `src/securityPolicy.js`
- `test/security-policy.test.js`
- `npm run test:security`

The route policy now explicitly enforces these invariants before requests reach the inner service:

- every `/api/wallet/*` path and `/api/checkout/wallet` is suspended;
- `POST /api/admin/tickets/check-in` is terminally blocked so permanent ticket codes cannot become admission authority again;
- private ticket order/My Tickets routes require a verified session at the gateway;
- ticket-finance, order-handoff, delivery, Admin, cash checkout and sensitive PayChangu routes are classified as privileged;
- caller-controlled actor/Admin headers are stripped and replaced only after Supabase bearer verification.

The route-policy regression suite passes locally under Node's built-in test runner.

### Still under controlled comparison

- `src/server.js`
- backend README/source-of-truth documentation

`server.js` is intentionally not blindly overwritten because the newer app-repository copy mixes valid new EYA routes with legacy Wallet implementations and static ticket-admission QR/check-in routes.

## `server.js` route classification

### Preserve / merge

- health and payment return pages;
- authenticated order handoff view/verification;
- Admin payments/orders/support;
- Admin vendors/catalog/housing/users/broadcast management;
- Delivery Agent dispatch/assignment/status routes;
- trusted payout-destination intake;
- ticket event/order/listing business routes that do **not** create admission authority from a permanent ticket code;
- cash checkout with pending-until-handoff semantics.

### Preserve only behind the existing security gateway / trusted auth

- generic PayChangu initiate/verify/reconcile routes while production caller inventory is incomplete;
- Admin and delivery mutation routes;
- any service-role-backed route.

`src/secure-entry.js` validates bearer identity, strips caller-supplied actor/Admin headers, protects payment verification ownership, bounds privileged JSON bodies, blocks Wallet paths, protects private ticket/finance/order routes and independently blocks the legacy static ticket check-in route. Those controls must not be weakened during the inner-server merge.

### Exclude / replace

- all `/api/wallet/*` functionality;
- Wallet checkout;
- static QR generation from `ticket_code`;
- `POST /api/admin/tickets/check-in` using permanent `ticket_code` as admission authority.

Ticket admission must remain on the live short-lived credential architecture. Production migration `live_ticket_credentials` issues 60-second credentials, permits only a short overlap for the previous credential and atomically invalidates credentials after successful check-in. Permanent ticket IDs/codes may remain support/reference identifiers only.

## Security constraints during merge

1. Wallet stays suspended.
2. `src/secure-entry.js` remains the external security boundary until an equivalent or stronger replacement is proven.
3. Cloudflare remains the VAC Payments / PayChangu provider boundary for the newer signed payment architecture.
4. Do not reactivate legacy static ticket QR/admission authority while merging Node ticket routes.
5. Do not deploy this branch to Render until payment and actor regression tests pass.
6. Do not switch Render away from `Tchoka/EYA-backend` until the candidate canonical backend is complete and tested.
7. Do not run blanket production Supabase migration pushes while migration history reconciliation remains open.
8. The Cloudflare Worker→EYA callback nonce change must still be deployed as a coordinated two-sided protocol change, never one side alone.

## Next controlled steps

1. Merge `server.js` route-by-route instead of wholesale copying it.
2. Add the valid newer Admin, delivery, cash, payout and non-static ticket business routes.
3. Keep the security gateway as the public Render entrypoint.
4. For ticket views, return ticket/reference data only; live admission QR/manual credentials come from `issue_ticket_live_credential`, not from `ticket_code`.
5. Remove dead Wallet mutation helpers once no internal server route references them.
6. Update the backend README after the final server shape is known.
7. Run Node syntax/startup checks plus actor/payment regression tests.
8. Only after passing tests, plan the Render Git-source switch to `dbdnd7rn/EYA-Main-Backend`.
