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
- `src/paychangu.js`
- `env.example`

### Reconciled with additional security corrections

- `src/fulfillment.js`
- `src/secure-entry.js`
- `src/push.js`

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

Notification wording is also reconciled with those rules:

- verified historical Wallet-top-up payments no longer claim that money was credited to a Wallet;
- pending cash orders no longer tell customers/vendors that the order is already paid;
- COD notifications state that cash is collected only at verified handoff.

Legacy Wallet helper functions remain physically present inside `fulfillment.js` only because the old inner server and historical code are still being reconciled. The externally reachable gateway blocks Wallet, and the exported checkout function cannot execute Wallet mutations. Remove the dead helpers after `server.js` no longer references legacy Wallet behavior.

### Security policy/regression files added

- `src/securityPolicy.js`
- `test/security-policy.test.js`
- `npm run test:security`

The route policy explicitly enforces these invariants before requests reach the inner service:

- every `/api/wallet/*` path and `/api/checkout/wallet` is suspended;
- `POST /api/admin/tickets/check-in` is terminally blocked so permanent ticket codes cannot become admission authority again;
- private ticket order/My Tickets routes require a verified session at the gateway;
- ticket-finance, order-handoff, delivery, Admin, cash checkout and sensitive PayChangu routes are classified as privileged;
- caller-controlled actor/Admin headers are stripped and replaced only after Supabase bearer verification.

The route-policy regression suite passes locally under Node's built-in test runner.

### Caller inventory added

`CALLER_INVENTORY.md` records the actual current EYA callers from `dbdnd7rn/EYA/feat/hybrid-checkout`.

Key result: the canonical Node cutover is materially smaller than the newer monolithic `EYA/backend/src/server.js` suggests.

- ticket checkout goes to Supabase Edge `create-payment-checkout`, not Node;
- ticket payment truth/fulfilment comes from the signed VAC Payments callback, not a client or Node verify route;
- live ticket credential issuance/check-in are authenticated Supabase RPCs;
- Node ticket routes are needed only as read convenience/fallback routes for event/order/My Tickets data;
- cash checkout, handoff, delivery and the commerce/Admin workspace really do depend on Node;
- Admin ticket event/tier/order management currently uses Supabase helpers rather than Node ticket-admin CRUD.

Therefore the canonical server must not copy Node ticket payment initiation/verification or static admission code merely because it exists in the newer monolith.

## `server.js` route classification

### Preserve / merge

- health and payment return pages;
- authenticated order handoff view/verification;
- Admin payments/orders/support;
- Admin vendors/catalog/housing/users/broadcast management;
- Delivery Agent dispatch/assignment/status routes;
- trusted payout-destination intake;
- read-only ticket event/order/My Tickets convenience routes, without generated static QR admission data;
- cash checkout with pending-until-handoff semantics.

### Preserve only behind the existing security gateway / trusted auth

- generic PayChangu initiate/verify/reconcile routes while production caller inventory is incomplete;
- Admin and delivery mutation routes;
- any service-role-backed route.

`src/secure-entry.js` validates bearer identity, strips caller-supplied actor/Admin headers, protects payment verification ownership, bounds privileged JSON bodies, blocks Wallet paths, protects private ticket/finance/order routes and independently blocks the legacy static ticket check-in route. Those controls must not be weakened during the inner-server merge.

### Exclude / replace

- all `/api/wallet/*` functionality;
- Wallet checkout;
- Node `/api/tickets/orders` ticket-payment initiation as a competing authority;
- Node ticket payment verify/finalize routes as a competing authority;
- static QR generation from `ticket_code`;
- `POST /api/admin/tickets/check-in` using permanent `ticket_code` as admission authority.

Ticket admission must remain on the live short-lived credential architecture. Production migration `live_ticket_credentials` issues 60-second credentials, permits only a short overlap for the previous credential and atomically invalidates credentials after successful check-in. Permanent ticket IDs/codes may remain support/reference identifiers only.

## Additional app-side admission finding

The caller inventory found a legacy `checkInAdminTicketViaSupabase()` implementation still present in `EYA/lib/adminControlApi.ts`. It looks up and consumes permanent `ticket_code` values directly in Supabase. The current gate-specific API (`lib/ticketGateApi.ts`) correctly accepts only live/guest/offline credentials and calls `check_in_ticket_entry_credential`.

Required app hardening: deprecate/remove the static-code helper and ensure every scanner path uses `ticketGateApi.ts`. This is an app security cleanup, not a reason to restore the old Node route.

## COD merge invariants

The newer monolithic server has inconsistent COD checks. The canonical merge must use one definition everywhere:

- a delivery is eligible when the order is paid, **or** when it is an authorized pending cash order;
- pending cash orders must appear in dispatch/Admin views and be assignable;
- a delivery status update may move through searching/assigned/picked_up/arriving, but must not make a pending cash payment paid merely by setting `delivered`;
- verified handoff owns the final COD `payment_status=paid` and delivered transition.

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

1. Build the canonical inner server from the real caller set rather than copying the 100KB monolith wholesale.
2. Port the valid Admin commerce/support/vendor/catalog/housing/user/broadcast routes.
3. Port delivery routes with the COD invariants above.
4. Preserve cash checkout and handoff routes with pending-until-verified-handoff semantics.
5. Keep read-only ticket convenience routes free of static admission QR data.
6. Remove dead Wallet mutation helpers once no canonical server route references them.
7. Update the backend README after the final server shape is known.
8. Run Node syntax/startup checks plus actor/COD/payment/ticket-admission regression tests.
9. Only after passing tests, plan the Render Git-source switch to `dbdnd7rn/EYA-Main-Backend`.
