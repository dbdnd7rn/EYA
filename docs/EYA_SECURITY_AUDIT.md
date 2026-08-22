# EYA Security Audit

Status: active hardening sprint

Scope: both EYA repositories plus Supabase, Cloudflare, Render, PayChangu and every cross-service boundary.

## Security invariants

1. The client may request an action but never decides authorization, roles, money amounts, payment success, refunds or payouts.
2. Privileged changes authenticate the actor, authorize the exact resource, validate the transition and write an audit record.
3. Payment success is independently verified by a trusted backend/provider boundary.
4. Cross-service commands require idempotency, replay resistance, bounded inputs, rate limits and sanitized errors.
5. Wallet and wallet-backed payments are suspended. Historical data may remain for audit, but no user/client route, RPC, table access or service-role backend route may operate it.
6. Ticket Management operations permission and Finance / Settlement entitlement are separate authorities.
7. Security covers both repositories and infrastructure boundaries; an RLS-only review is not a complete EYA security audit.
8. A control is not considered deployed merely because it exists on a local or mirror branch. The exact production source/deploy provenance must be verified.

## Finding register

| ID | Severity | Surface | Finding | State |
|---|---|---|---|---|
| EYA-SEC-001 | High | Suspended Wallet | Wallet tab/routes were hidden, but general checkout, legacy `/api/wallet/*` handlers, badge queries and authenticated table access remained reachable. | **Re-opened at backend boundary.** Live Supabase client table/RPC privileges are revoked and direct client Wallet access is blocked. However the currently auditable `dbdnd7rn/EYA-Main-Backend` `main` and `feat/payment-architecture-v1-hybrid-checkout` server still expose authenticated `/api/wallet/me`, `/debug`, `/withdraw`, `/send`, `/request` and `/checkout` routes using service-role access, which bypasses client RLS/grant revocation. Wallet remains suspended; these routes must be disabled in the canonical/deployed backend before the invariant can be marked complete. |
| EYA-SEC-002 | High | Food payment authority | `approve_food_order_payment` permitted the food-provider owner to change an unverified order to `paid`. | Fixed locally: the RPC cannot change payment status; it only accepts provider-confirmed paid orders or an explicit pending COD payment before starting preparation. Do not deploy the Git-only food-payment migration until the current payment architecture and production migration history are reconciled. |
| EYA-SEC-003 | Passed | Ticket catalog mutations | `ticket_events` and `ticket_tiers` expose mutation privileges at the table-grant layer. | Verified live: RLS permits writes only through `is_admin()`; public reads expose only approved published material. Organizer changes use owner-bound workflow RPCs and approved-event mutation guards. |
| EYA-SEC-004 | Passed with intentional RPC warnings | Privileged RPCs | Many `SECURITY DEFINER` Admin/organizer/finance functions are executable by `authenticated`. | Classified live: no public `SECURITY DEFINER` function is executable by `anon`; authenticated entry points inspected in this pass derive `auth.uid()`, check `is_admin()` and/or validate Ticket Management / Finance entitlement / owned resources. Internal finance helpers are service-only and use fixed search paths. Advisor warnings remain expected for intentionally client-callable, internally authorized RPCs; high-impact primitives should still be moved behind Edge/service-only boundaries where that reduces exposure without breaking legitimate client workflows. |
| EYA-SEC-005 | Critical | Legacy backend Admin API | `requireAdmin` trusted `x-admin-user-id`/actor identity headers without authenticating a bearer token. Knowledge of an Admin UUID could permit Admin impersonation. | **Re-opened / deploy provenance unresolved.** The currently auditable `dbdnd7rn/EYA-Main-Backend` `main` and hybrid-checkout branch still implement header-trusted Admin identity and protect high-impact payment/order/support endpoints with it. The EYA client already sends a bearer token when available, so the canonical backend should derive the Admin identity only from a validated Supabase session and reject mismatched legacy headers. Do not mark fixed until the exact deployed Render source is identified and regression-tested. |
| EYA-SEC-006 | Critical | Delivery API | Delivery authorization trusted `x-user-id`/`x-actor-user-id`, enabling identity spoofing for agent, vendor-owner or Admin operations. | **Re-opened / deploy provenance unresolved.** The auditable backend still derives delivery actor identity from caller-controlled headers for unassigned delivery listing, assignment, unassignment and status transitions. Require a valid bearer session, derive the actor from the session and treat any legacy identity header as non-authoritative (or reject mismatch). Regression-test agent, vendor owner and Admin roles against cross-user spoof attempts. |
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
| EYA-SEC-017 | High operational integrity | Supabase migration history | Part of the live 2026-08-22 migration history uses different version IDs from logically similar migration files in Git. A normal `db push` could treat duplicate DDL as new and re-run policy/grant changes. | Open blocker: live `supabase_migrations.schema_migrations` retains exact statements. Current reconciliation found 19 exact version/name matches, 32 same-name migrations with different versions, four live-only logical migrations and two Git-only migrations. Same-name files are not universally content-identical, so timestamp-only renaming is unsafe. Do not run a blanket production `supabase db push`; reconstruct and replay on a disposable database first. |
| EYA-SEC-018 | Low/medium hardening | PostgreSQL function resolution | Supabase Advisor still reported mutable `search_path` on `wallet_set_updated_at`, `set_updated_at`, `set_updated_at_column` and `food_order_room_label`. | Fixed live and synced with exact live migration version; functions now use fixed `public, auth, pg_temp` search paths without changing business logic. |
| EYA-SEC-019 | Critical operational integrity | Render deployment provenance | Render exposes two public Node services, `EYA-backend` and `paychangu-backend`, both auto-deploying `main` from `Tchoka/EYA-backend`, while the repository currently auditable through the EYA project is `dbdnd7rn/EYA-Main-Backend`. The live Render deploy commit is an April 2026 SHA that is not present in the auditable mirror. | Open blocker. Treat Render code as unverified until the canonical Git source is made auditable or its deployed commit is reproduced. Do not assume a fix in `dbdnd7rn/EYA-Main-Backend` protects Render, and do not retire/suspend the services until app/environment usage is proven. Render request-log lookup for the last 30 days returned no request entries, which is a useful legacy-service signal but not sufficient proof of zero dependency. |
| EYA-SEC-020 | Critical | Direct payment row authority | Live `payments` grants still allow authenticated INSERT and policy `payments_insert_own_or_admin` permits a signed-in caller to insert when `user_id = auth.uid()` (or `user_id IS NULL`). Caller-controlled columns include `status`, `amount_mwk`, references, `paid_at`, `verified_at`, related order IDs and metadata; there is no payment-authority trigger beyond `updated_at`. | Open payment blocker. A client could potentially manufacture a self-owned payment row marked `paid` even though trusted ticket checkout already uses the server-authoritative Edge Function. Do not make an ad-hoc production payment change during this audit; first inventory all legitimate payment initiation paths, then revoke direct client INSERT / narrow the API so only trusted backend/provider verification can establish payment truth. |
| EYA-SEC-021 | High | Notification integrity / spam | `notifications_insert_authenticated_compat` checks only that `auth.uid()` is non-null, while the app helper accepts an arbitrary target `userId` and directly inserts rows. A signed-in user who knows another user UUID can potentially spoof in-app notifications to that user. | Open. Move notification creation to trusted server/RPC paths with recipient authorization and abuse controls, then remove the compatibility INSERT policy. Preserve own-user read/update behavior. |
| EYA-SEC-022 | High | Legacy Render PayChangu API | The auditable backend exposes unauthenticated `POST /api/paychangu/initiate` and `GET /api/paychangu/verify/:txRef`; the verify route calls backend finalization for a known payment reference. The current architecture says Cloudflare is the payment authority and Render must not duplicate it. | Open legacy-boundary review. Do not change the proven payment flow yet. First prove whether production EYA still points `EXPO_PUBLIC_PAYCHANGU_BACKEND` at either Render service. If these routes are legacy, retire or strongly authenticate/rate-limit them; if still required, bind verification/finalization to authenticated ownership or trusted server-to-server authorization and preserve webhook signature/provider re-verification. |
| EYA-SEC-023 | Medium/high hardening | Legacy backend browser/API exposure | The auditable Node backend globally enables permissive `cors()` while exposing service-role-backed Admin, delivery, Wallet and payment routes; both Render services accept traffic from `0.0.0.0/0` and have no configured health-check path. | Open. After canonical-source and dependency verification, restrict browser origins where browser access is genuinely required, require bearer/server authentication for privileged routes, add application-level abuse limits, and configure an explicit health endpoint for deployment monitoring. Native clients do not require wildcard CORS. |
| EYA-SEC-024 | Low/medium auth hygiene | Supabase password protection | Supabase security advisor reports leaked-password protection as disabled. | Open. Evaluate enabling compromised-password checks together with sign-up/reset UX and regression tests; this is defense-in-depth after current critical authorization/payment blockers. |

## Live Supabase verification notes — 2026-08-22

The following checks are observations of the connected production project, not assumptions from migration files:

- internal finance/revision/live-credential/VAC event tables that have RLS enabled but no policies also have no `anon` or `authenticated` table DML privileges; the no-policy advisor INFOs are therefore intentional service-only posture, not public exposure;
- no public `SECURITY DEFINER` function is executable by `anon`;
- authenticated `SECURITY DEFINER` functions sampled in this pass contain explicit session/Admin/finance-entitlement authorization guards;
- `wallet_accounts` and `wallet_activities` have no `anon` or `authenticated` DML grants, and Wallet RPCs checked are service-role only;
- ticket issue/check-in/payment tables use own/Admin RLS boundaries as expected;
- the two remaining direct-record risks identified in this pass are the permissive `payments` INSERT path and cross-user-compatible notification INSERT policy.

## Render verification notes — 2026-08-22

Connected Render inspection currently shows:

- `EYA-backend` and `paychangu-backend` are public Frankfurt Node web services with automatic deployment from `Tchoka/EYA-backend` `main`;
- both services start the same `vac-must-paychangu-backend@1.0.0` server package;
- the latest recorded live `EYA-backend` deployment is from 2026-04-03 and its commit SHA is not present in `dbdnd7rn/EYA-Main-Backend`;
- current app logs show service restarts/listening but no request-log entries were returned for the queried last-30-day window;
- the GitHub connector cannot currently read `Tchoka/EYA-backend`, so deployed Render source must not be inferred from the mirror merely because file/package names look similar.

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
- major public-schema RLS/grant failures;
- obvious anonymous privileged RPC exposure;
- profile-role self-escalation path;
- commerce table mutation authority;
- inbound Edge -> Cloudflare signed-command nonce foundation;
- Worker abuse-protection foundation;
- remaining mutable public function search paths;
- live classification of internal no-policy tables and privileged RPC execution grants.

Re-opened/active blockers from this pass:
- canonical/deployed Render source provenance is unresolved;
- auditable backend still contains header-trusted Admin/delivery authorization;
- auditable backend still exposes service-role Wallet routes despite product-wide Wallet suspension;
- live direct payment-row INSERT authority remains broader than the current trusted payment architecture permits;
- authenticated notification creation can target arbitrary user IDs;
- production migration history remains unsafe for blanket `db push`.

Next security work:
1. establish whether production EYA still depends on either Render service, without changing the working payment flow;
2. make the canonical Render backend source auditable, then enforce bearer-derived Admin/delivery identity and disable Wallet routes;
3. inventory all legitimate `payments` insertion paths before narrowing the live INSERT boundary;
4. migrate notification emission to trusted recipient-authorized paths and remove the compatibility policy;
5. coordinated Worker -> EYA callback nonce deployment/test when Cloudflare deployment access is available;
6. audit Auth/session/reset/OAuth/deep-link hijacking paths;
7. audit uploads/Cloudinary, URL handling and web-rendered content for XSS/SSRF/file abuse;
8. audit dependency/secrets/log exposure in both repositories;
9. reconcile Supabase migration history before normal production CLI push.

## Finance handoff

Operations-vs-Finance entitlement, stable Promoter ownership, verified payout-destination foundation and immutable organization liability foundation now exist.

After the security baseline, finance should resume at the remaining real-money blockers: provider-settled funds authority, refund lifecycle, cancellation freeze/reconciliation, automatic organization-liability offset, fee/grace-period decisions and finally an idempotent/replay-resistant payout executor.
