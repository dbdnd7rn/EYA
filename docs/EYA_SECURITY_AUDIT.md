# EYA Security Audit

Status: active hardening sprint

Scope: both EYA repositories plus Supabase, Cloudflare, Render, PayChangu and every cross-service boundary.

## Security invariants

1. The client may request an action but never decides authorization, roles, money amounts, payment success, refunds or payouts.
2. Privileged changes authenticate the actor, authorize the exact resource, validate the transition and write an audit record.
3. Payment success is independently verified by a trusted backend/provider boundary.
4. Cross-service commands require idempotency, replay resistance, bounded inputs, rate limits and sanitized errors.
5. Wallet and wallet-backed payments are suspended. Historical data may remain for audit, but no user/client route, RPC or table access may operate it.
6. Ticket Management operations permission and future finance/settlement entitlement are separate authorities.

## Finding register

| ID | Severity | Surface | Finding | State |
|---|---|---|---|---|
| EYA-SEC-001 | High | Suspended Wallet | Wallet tab/routes were hidden, but general checkout, legacy `/api/wallet/*` handlers, badge queries and authenticated table access remained reachable. | Fixed locally/live: checkout authority and badge reads removed; legacy routes and reconciliation return HTTP 410; client table/RPC privileges revoked. Delayed historical top-up verification records a reconciliation-required payment without mutating Wallet balances. |
| EYA-SEC-002 | High | Food payment authority | `approve_food_order_payment` permitted the food-provider owner to change an unverified order to `paid`. | Fixed locally: the RPC cannot change payment status; it only accepts provider-confirmed paid orders or an explicit pending COD payment before starting preparation. |
| EYA-SEC-003 | Passed | Ticket catalog mutations | `ticket_events` and `ticket_tiers` expose mutation privileges at the table-grant layer. | Verified live: RLS permits writes only through `is_admin()`; public reads expose only approved published material. Organizer changes use owner-bound workflow RPCs and approved-event mutation guards. |
| EYA-SEC-004 | Passed with intentional RPC warnings | Privileged RPCs | Many `SECURITY DEFINER` Admin/organizer/finance functions are executable by `authenticated`. | Verified live: every Admin RPC performs an internal `is_admin()` check; user RPCs bind `auth.uid()` to the owned ticket, event, revision, transfer or organization. Search paths are fixed. Supabase Advisor warnings remain expected for intentionally client-callable, internally authorized RPCs. |
| EYA-SEC-005 | Critical | Legacy backend Admin API | `requireAdmin` trusted `x-admin-user-id`/actor identity headers without authenticating a bearer token. Knowledge of an Admin UUID could permit Admin impersonation. | Fixed locally: require a valid Supabase bearer session, derive the actor from it and reject any mismatched identity header. Regression-test every Admin endpoint. |
| EYA-SEC-006 | Critical | Delivery API | Delivery authorization trusted `x-user-id`/`x-actor-user-id`, enabling identity spoofing for agent, vendor-owner or Admin operations. | Fixed locally: derive delivery actors from a validated bearer session and reject mismatched legacy headers. Regression-test list, assignment and state transitions. |
| EYA-SEC-007 | Critical | Cash on Delivery | Customer-created cash orders were immediately recorded as `paid` with `paid_at`/`verified_at`, before cash collection. This could unlock fulfilment and revenue without payment. | Fixed locally: cash orders/payments remain pending, are delivery-eligible as explicit COD, and become paid only after authorized PIN/QR handoff verification. |
| EYA-SEC-008 | High | Cloudflare signed commands | App HMAC covered timestamp, method, path and body but allowed the same valid signed request to replay during the five-minute clock window. | Fixed on the feature branches: signer includes a random nonce in the canonical HMAC; Worker atomically claims `(app_id, nonce)` in D1 and rejects reuse. Remote D1 migration/deployment and replay regression test remain required. |
| EYA-SEC-009 | High | Cloudflare abuse limits | Worker endpoints read request bodies without an explicit byte limit, and public callback/return/verification routes had no application-level rate limit. | Fixed on the backend feature branch: bodies are capped at 64 KiB and D1 fixed-window limits cover intents, public results, webhooks and outbox delivery. Migration/deploy and 413/429 regression tests remain required. |
| EYA-SEC-010 | Positive control | Cloudflare payment verification | Worker uses constant-time HMAC comparison, timestamp expiry, app-scoped secrets, D1 intent idempotency, PayChangu webhook signature verification, duplicate-event storage and independent provider re-verification before fulfilment. | Preserve and regression-test these controls while adding nonce/rate limiting. |
| EYA-SEC-011 | Critical | Live Supabase public schema | `listing_versions`, `reports`, `orders`, `order_items`, `deliveries`, `order_handoffs`, `driver_locations` and `trust_scores` had RLS disabled while `anon` and `authenticated` held broad table privileges. | Fixed live and captured in migration: RLS enabled on all eight; anonymous privileges removed; legacy tables deny all; active commerce tables use participant-scoped policies and reduced grants. Advisor recheck no longer reports RLS-disabled errors. |
| EYA-SEC-012 | Critical | Subscription authority RPC | `activate_subscription` was a client-callable `SECURITY DEFINER` RPC for both anonymous and signed-in users, allowing callers to create arbitrary active landlord subscriptions. | Fixed live and captured in migration: only `service_role` may execute it; maintenance/trigger functions were removed from the REST RPC surface; mutable search paths were fixed for subscription functions. |
| EYA-SEC-013 | Critical | Commerce record authority | Any authenticated order participant had table-level `UPDATE` on entire order rows, exposing totals, ownership, delivery fields and `payment_status`; client inserts could also supply self-calculated prices. | Fixed live and captured in migration: commerce tables are client read-only; vendor status changes use an owner-bound RPC with payment/COD prerequisites, explicit transitions and terminal-state protection. The app seller mutation now calls this RPC. |
| EYA-SEC-014 | Critical | Account role escalation | Authenticated users could update their own complete `profiles` row, including `role`; three Auth triggers also copied the user-editable `raw_user_meta_data.role`. Because `is_admin()` trusts `profiles.role`, a normal account could potentially self-promote and cross every Admin boundary. | Fixed live and captured in migration: clients cannot insert profiles or update identity/role fields; only safe profile columns are writable. Auth triggers always create a normal student account and never overwrite an existing role from metadata. Signup/profile synchronization was updated for the restricted grants. |
| EYA-SEC-015 | Security foundation | Payout destination confidentiality | Organizer payout beneficiaries require sensitive phone/account details, but those values must not become client-readable table data or routine UI/log payloads. | Implemented through application boundary: destination tables are service-only; trusted backend validates and AES-256-GCM encrypts details, stores a keyed fingerprint and masked identifier, and calls a service-only RPC. Organizer and Admin screens receive masked metadata only; verification binds a verified primary destination to payout requests. Deployment key configuration and rotation test remain pending. |

## Pass order

1. Suspended Wallet attack surface.
2. Public tables, grants, RLS and direct-record IDOR.
3. `SECURITY DEFINER` and privileged RPC authorization.
4. Client/server authority and secret exposure.
5. Cross-repository authentication, replay, idempotency and rate limiting.
6. Sessions, redirects, uploads, input bounds and denial-of-service controls.
7. Regression tests by actor: anonymous, normal user, vendor, landlord, agent, Ticket Management and Admin.

## Finance handoff

After the security baseline, resume Ticket Management Operations Access vs Finance/Settlement Entitlement. Finance authority belongs to the stable Promoter/Organization and may survive operations expiry until refunds, liabilities, holds and final settlement are closed.
