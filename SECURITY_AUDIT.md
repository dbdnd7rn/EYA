# EYA Main Backend — Security Audit

Status: active hardening sprint

Date: 2026-08-22

This repository is treated as the auditable EYA backend mirror. Render currently deploys `Tchoka/EYA-backend`, so a change here must not be assumed to protect production until deployment provenance is reconciled.

## Security invariants

- Caller-controlled headers are never authoritative identity.
- Admin, Delivery Agent and vendor-owner authorization derives from a validated Supabase bearer session or a trusted server-to-server credential.
- Service-role access is backend-only and must not turn a weakly authenticated HTTP route into an RLS bypass.
- Wallet and wallet-backed payments are suspended; no public/user backend route may operate Wallet balances or activities.
- PayChangu/payment success is established only through the trusted payment boundary and independent provider verification.
- Legacy Render services must not duplicate or compete with the Cloudflare payment source of truth.

## Verified findings

### BACKEND-SEC-001 — Critical — Admin identity header spoofing

Current `src/server.js` implements `requireAdmin()` by reading `x-admin-user-id`, `x-actor-user-id` or `x-user-id`, then loading that profile with the service-role Supabase client. The bearer token is not bound to the claimed Admin ID.

Impact: possession/knowledge of a valid Admin UUID can potentially impersonate that Admin on routes including Admin payments, orders, driver assignment and support-ticket operations.

Required remediation:
1. require a valid `Authorization: Bearer <Supabase access token>` session;
2. derive the actor ID exclusively from the validated session;
3. load the profile for that session user and require Admin authorization;
4. reject a legacy identity header if supplied and it does not exactly match the session user;
5. regression-test every Admin endpoint with anonymous, normal-user, mismatched-header and valid-Admin actors.

### BACKEND-SEC-002 — Critical — Delivery actor header spoofing

`actorIdFromHeaders()` is used by delivery listing/assignment/unassignment/status flows. Authorization therefore starts from caller-controlled `x-user-id` / `x-actor-user-id` rather than the authenticated session.

Impact: an attacker who knows an eligible Delivery Agent, vendor owner or Admin UUID may be able to act as that principal.

Required remediation: use the same bearer-derived actor helper for all delivery routes and treat identity headers as non-authoritative compatibility data only.

### BACKEND-SEC-003 — Critical — Wallet still active through service-role backend

The server exposes authenticated Wallet routes including:
- `GET /api/wallet/me`
- `GET /api/wallet/debug`
- `POST /api/wallet/withdraw`
- `POST /api/wallet/send`
- `POST /api/wallet/request`
- `POST /api/wallet/checkout`

These routes read/write `wallet_accounts` and `wallet_activities` using backend service-role access. Revoking mobile-client table/RPC privileges in Supabase therefore does not suspend Wallet while these routes remain reachable.

Required remediation: return a terminal suspended response (for example HTTP 410) from every Wallet route, remove any path that mutates balances/activities, and preserve historical rows only for audit/reconciliation. Do not add new Wallet behavior.

### BACKEND-SEC-004 — High — Legacy PayChangu endpoints are not consistently authenticated

The current mirror exposes unauthenticated `POST /api/paychangu/initiate` and unauthenticated `GET /api/paychangu/verify/:txRef`. The verify path can call payment finalization after provider verification. `POST /api/paychangu/reconcile` does require a bearer session and ownership/Admin authorization.

The EYA app branch currently contains legacy/generic payment code that calls these Render-style endpoints, while ticket checkout uses the newer server-authoritative Edge/Cloudflare path. Payment behavior must not be changed casually during this audit.

Required next step: inventory real production callers and distinguish legacy/general payments from the Cloudflare ticket-payment architecture. If the Render routes remain required, bind sensitive finalization to authenticated ownership/trusted server authorization and add abuse controls. If they are legacy, retire them only after dependency verification.

### BACKEND-SEC-005 — Medium/High — Wildcard browser exposure

`app.use(cors())` enables permissive CORS globally while the server has service-role authority and exposes Admin, delivery, Wallet and payment routes.

Required remediation after caller inventory: allow only necessary browser origins, keep native/server calls independent of browser CORS, bound request bodies, and apply route-appropriate rate limits.

### BACKEND-SEC-006 — Critical operational integrity — Render source provenance mismatch

Connected Render currently has two public services (`EYA-backend`, `paychangu-backend`) auto-deploying `main` from `Tchoka/EYA-backend`. The latest recorded live `EYA-backend` deploy is an April 2026 commit SHA not present in this repository. GitHub access available to this audit cannot read `Tchoka/EYA-backend`.

Therefore:
- this mirror is not proof of the exact live Render source;
- fixes committed here must not be described as deployed;
- Render services must not be suspended until caller/config dependency is verified;
- canonical repository ownership/deployment should be reconciled before production security claims are closed.

## Current order

1. Reconcile canonical source/deployment provenance.
2. Replace header-trusted Admin and delivery identity with bearer-derived identity.
3. Disable all Wallet routes in the canonical backend.
4. Inventory generic/legacy PayChangu callers before modifying payment routes.
5. Restrict CORS and add route abuse limits.
6. Add regression tests for anonymous, normal User, Delivery Agent, vendor owner and Admin actors.
7. Review secrets/logging/dependencies and production monitoring.
