# EYA Backend Caller Inventory

Date: 2026-08-22

This inventory records which EYA client paths actually depend on the Node/Render backend while `EYA/backend` is reconciled into `EYA-Main-Backend`. It is intentionally based on current `dbdnd7rn/EYA` source on `feat/hybrid-checkout` rather than on assumptions from the older monolithic backend.

## Ticket payments

### Authoritative checkout path

`lib/standardTicketCheckout.ts` sends ticket checkout to the Supabase Edge Function:

`POST /functions/v1/create-payment-checkout`

The four supported methods are Airtel Money, TNM Mpamba, bank transfer and card. The client validates the returned PayChangu checkout host for card checkout.

`lib/tickets.ts` also routes `createTicketOrderPayment()` to the Edge-function checkout path.

**Conclusion:** do not make Render/Node a second ticket payment-initiation authority. The newer Node `/api/tickets/orders` payment-creation implementation is not required as the canonical ticket collection path.

### Ticket payment verification

`lib/tickets.ts` explicitly states that payment truth comes only from the signed VAC callback. `verifyTicketOrderPayment()` only reads EYA order state from Supabase and does not call PayChangu or issue tickets.

**Conclusion:** do not preserve the newer Node ticket `/:orderId/verify` route as payment authority. Ticket fulfilment follows the trusted VAC Payments callback path.

## Ticket reads

Current client behavior is deliberately resilient:

- published event discovery: Supabase first, Node `/api/tickets/events` only as fallback;
- order detail: Node `GET /api/tickets/orders/:orderId` first, Supabase fallback;
- My Tickets: Node `GET /api/tickets/my` first, Supabase fallback.

These Node routes are read-only convenience APIs. They must return ticket/reference data only and must never generate admission QR codes from permanent `ticket_code` values.

## Ticket admission

`lib/ticketCredential.ts` issues personal live credentials directly through authenticated Supabase RPC `issue_ticket_live_credential`.

`lib/ticketGateApi.ts` accepts only live/guest/offline credential prefixes and checks in through authenticated RPC `check_in_ticket_entry_credential`. Its user-facing errors explicitly reject permanent ticket references.

**Conclusion:** canonical Render ticket routes have no role in creating or validating admission credentials. Permanent ticket IDs/codes remain support/reference data only.

### Legacy client cleanup finding

`lib/adminControlApi.ts` still contains an old direct-Supabase `checkInAdminTicketViaSupabase()` implementation that looks up and consumes permanent `ticket_code` values, and `checkInAdminTicket()` currently returns that helper. This conflicts with the live credential rule even though the current scanner path has a dedicated `ticketGateApi.ts` live-credential API.

Required app hardening: remove/deprecate this static-code fallback and ensure every scanner/check-in caller uses `ticketGateApi.ts`. The canonical backend must not preserve a matching static-code route.

## Commerce cash checkout

`lib/cashCheckout.ts` directly depends on:

`POST /api/checkout/cash`

It sends the authenticated bearer token and expects `payment_status: "pending"`.

**Canonical Node requirement:** preserve this route with server-side quoting and pending-until-verified-handoff semantics. Cash must not be marked paid at order creation.

## Order handoff

`lib/orderHandoff.ts` directly depends on:

- `GET /api/orders/:orderId/handoff`
- `POST /api/orders/:orderId/handoff/verify`

**Canonical Node requirement:** preserve both authenticated routes. Handoff verification is the authority that may complete an eligible COD order and convert its pending cash payment to paid.

## Delivery Agent workspace

`lib/agentDeliveryApi.ts` directly depends on:

- `GET /api/deliveries/unassigned`
- `POST /api/deliveries/:orderId/assign`
- `POST /api/deliveries/:orderId/unassign`
- `POST /api/deliveries/:orderId/status`

All current calls include a bearer token when available and legacy user-id headers. The external security gateway must continue stripping the caller header and deriving identity from the bearer session.

**COD correction required during canonical merge:** pending cash orders must be eligible for delivery discovery/assignment, but `POST /status` must not be allowed to make a COD payment paid merely by setting status `delivered`. Verified handoff owns the final COD paid/delivered transition.

## Admin operations that use Node

`lib/adminControlApi.ts` currently uses Node/Render for core commerce/admin operations including:

- Admin orders and payments;
- order-status changes and driver assignment;
- support-ticket list/respond;
- vendor list/create/update/delete;
- catalog list/create/update/delete;
- housing listing list/create/update/delete;
- user list/update/delete/invite where available;
- Admin broadcast where the backend path is used.

The client still sends `x-admin-user-id` for compatibility. This header is non-authoritative: `src/secure-entry.js` strips it and re-injects only the authenticated session user.

## Admin ticket management

Current `lib/adminControlApi.ts` manages ticket events, tiers and ticket-order views through Supabase helpers rather than relying on the Node ticket-admin routes.

**Conclusion:** Node ticket-admin CRUD is not a cutover blocker. Prefer the governed Supabase/RPC model already used by the app instead of copying duplicate ticket authority into Render.

## Legacy generic PayChangu compatibility

Generic app payment code may still reference the configured `PAYCHANGU_BACKEND`. Until the remaining caller inventory is complete, keep generic `/api/paychangu/initiate`, `/verify/:txRef` and `/reconcile` compatibility behind the security gateway. Do not redesign their payment behavior during source reconciliation.

## Canonical Node cutover set

Required for the first controlled `EYA-Main-Backend` cutover:

1. `/api/checkout/cash`
2. `/api/orders/:orderId/handoff` and `/handoff/verify`
3. `/api/deliveries/*`
4. `/api/admin/*` commerce/support/vendor/catalog/housing/user/broadcast routes actually called by the app
5. encrypted `/api/ticket-finance/payout-destinations`
6. read-only ticket event/order/My Tickets convenience routes, with no static admission QR generation
7. generic PayChangu compatibility routes only while caller inventory shows they remain necessary

Excluded from the canonical cutover:

- every Wallet route and Wallet checkout;
- Node ticket payment initiation/verification as a competing authority;
- static QR generation from `ticket_code`;
- permanent-code ticket check-in.

Production Render remains untouched until the canonical candidate passes actor, COD, ticket-admission and payment-regression tests.