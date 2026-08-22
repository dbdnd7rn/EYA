# EYA Security Audit

Status: active hardening sprint

Scope: both EYA repositories plus Supabase, Cloudflare, Render, PayChangu and every cross-service boundary.

## Security invariants

1. The client may request an action but never decides authorization, roles, money amounts, payment success, refunds or payouts.
2. Privileged changes authenticate the actor, authorize the exact resource, validate the transition and write an audit record.
3. Payment success is independently verified by a trusted backend/provider boundary.
4. Cross-service commands require idempotency, replay resistance, bounded inputs, rate limits and sanitized errors.
5. Wallet and wallet-backed payments are suspended. Historical data may remain for audit, but no user/client route, RPC or table access may operate it.
6. Ticket Management operations permission and Finance / Settlement entitlement are separate authorities.
7. Security covers both repositories and infrastructure boundaries; an RLS-only review is not a complete EYA security audit.

## Finding register

| ID | Severity | Surface | Finding | State |
|---|---|---|---|---|
| EYA-SEC-001 | High | Suspended Wallet | Wallet tab/routes were hidden, but general checkout, legacy `/api/wallet/*` handlers, badge queries and authenticated table access remained reachable. | Fixed locally/live: checkout authority and badge reads removed; legacy routes and reconciliation return HTTP 410; client table/RPC privileges revoked. Delayed historical top-up verification records a reconciliation-required payment without mutating Wallet balances. Wallet remains suspended and must not be made user-visible. |
| EYA-SEC-002 | High | Food payment authority | `approve_food_order_payment` permitted the food-provider owner to change an unverified order to `paid`. | Fixed locally: the RPC cannot change payment status; it only accepts provider-confirmed paid orders or an explicit pending COD payment before starting preparation. |
| EYA-SEC-003 | Passed | Ticket catalog mutations | `ticket_events` and `ticket_tiers` expose mutation privileges at the table-grant layer. | Verified live: RLS permits writes only through `is_admin()`; public reads expose only approved published material. Organizer changes use owner-bound workflow RPCs and approved-event mutation guards. |
| EYA-SEC-004 | Passed with intentional RPC warnings | Privileged RPCs | Many `SECURITY DEFINER` Admin/organizer/finance functions are executable by `authenticated`. | Classified live: Admin entry points perform internal `is_admin()` checks; organizer/user functions derive `auth.uid()` and/or validate Ticket Management, Finance entitlement or owned resources. Advisor warnings remain expected for intentionally client-callable, internally authorized RPCs; high-impact primitives should still be moved behind Edge/service-only boundaries where that reduces exposure without breaking legitimate client workflows. |
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
| EYA-SEC-016 | High defense-in-depth | Worker -> EYA callback replay | Payment-event idempotency already prevents duplicate fulfilment, but the outgoing Worker callback HMAC used timestamp/method/path/body without a one-time nonce, so a captured signed callback could be replayed inside the clock window and consume processing before duplicate-event handling. | Live DB nonce-claim primitive added. Both repos now contain coordinated callback nonce/HMAC changes: Worker creates a fresh UUID nonce per delivery attempt and EYA requires/claims it before processing. **Do not deploy only one side.** Cloudflare Worker and `payment-confirmed` Edge Function require a coordinated deploy, then replay/idempotency regression testing. Until then the current live callback protocol remains unchanged and duplicate fulfilment is still protected by `vac_payment_events.idempotency_key`. |
| EYA-SEC-017 | High operational integrity | Supabase migration history | Part of the live 2026-08-22 migration history uses different version IDs from logically similar migration files in Git. A normal `db push` could treat duplicate DDL as new and re-run policy/grant changes. | Open blocker: live `supabase_migrations.schema_migrations` retains exact statements, so history can be reconstructed safely. Do not run a blanket production `supabase db push` until exact live versions are restored/mapped and duplicate re-authored local migrations are reconciled on a disposable database. |
| EYA-SEC-018 | Low/medium hardening | PostgreSQL function resolution | Supabase Advisor still reported mutable `search_path` on `wallet_set_updated_at`, `set_updated_at`, `set_updated_at_column` and `food_order_room_label`. | Fixed live and synced with exact live migration version; functions now use fixed `public, auth, pg_temp` search paths without changing business logic. |

## Pass order

1. Suspended Wallet attack surface.
2. Public tables, grants, RLS and direct-record IDOR.
3. `SECURITY DEFINER` and privileged RPC authorization.
4. Client/server authority and secret exposure.
5. Cross-repository authentication, replay, idempotency and rate limiting.
6. Sessions, password reset/OAuth/deep links and privileged-account protection.
7. Uploads, XSS/SSRF-style URL/content boundaries, input bounds and denial-of-service controls.
8. Dependencies, secrets, logging, monitoring, backup/restore and incident-response readiness.
9. Regression tests by actor: anonymous, normal User, Landlord, Food Provider, Delivery Agent, Ticket Management, Finance and Admin.

## Current security checkpoint

Completed/mostly completed foundation work:
- suspended Wallet client/database attack surface;
- major public-schema RLS/grant failures;
- obvious anonymous privileged RPC exposure;
- profile-role self-escalation path;
- commerce table mutation authority;
- inbound Edge -> Cloudflare signed-command nonce foundation;
- Worker abuse-protection foundation;
- remaining mutable public function search paths.

Next security work:
1. coordinated Worker -> EYA callback nonce deployment/test when Cloudflare deployment access is available;
2. audit Auth/session/reset/OAuth/deep-link hijacking paths;
3. audit uploads/Cloudinary, URL handling and web-rendered content for XSS/SSRF/file abuse;
4. audit dependency/secrets/log exposure in both repositories;
5. inspect the remaining high-impact Admin/money RPCs for Edge/service-only placement and step-up/MFA needs;
6. reconcile Supabase migration history before normal production CLI push.

## Finance handoff

Operations-vs-Finance entitlement, stable Promoter ownership, verified payout-destination foundation and immutable organization liability foundation now exist.

After the security baseline, finance should resume at the remaining real-money blockers: provider-settled funds authority, refund lifecycle, cancellation freeze/reconciliation, automatic organization-liability offset, fee/grace-period decisions and finally an idempotent/replay-resistant payout executor.
