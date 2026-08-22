# EYA Main Backend — Security Audit

Status: active hardening sprint

Date: 2026-08-22

This repository is the backend repository named by the EYA architecture, but the security pass found a newer backend copy under `dbdnd7rn/EYA/backend` on `feat/hybrid-checkout`. Render currently deploys `Tchoka/EYA-backend`. These three source locations are not synchronized, so a security property must not be called production-effective until deployment provenance is reconciled.

## Security invariants

- Caller-controlled headers are never authoritative identity.
- Admin, Delivery Agent and vendor-owner authorization derives from a validated Supabase bearer session or a trusted server-to-server credential.
- Service-role access is backend-only and must not turn a weakly authenticated HTTP route into an RLS bypass.
- Wallet and wallet-backed payments are suspended; no public/user backend route may operate Wallet balances or activities.
- PayChangu/payment success is established only through the trusted payment boundary and independent provider verification.
- Render must not duplicate or compete with the Cloudflare payment source of truth.
- Payment behavior is not being redesigned as part of this source-of-truth cleanup.

## Source reconciliation

Three materially different backend copies exist:

1. `dbdnd7rn/EYA/backend` — newer candidate implementation on `feat/hybrid-checkout`.
2. `dbdnd7rn/EYA-Main-Backend` — intended backend repository, but current `main` is stale relative to the copy above.
3. `Tchoka/EYA-backend` — current Render Git source; exact contents are not readable through the GitHub connection available to this audit.

The newer `dbdnd7rn/EYA/backend/src/server.js` already contains local fixes for the first three findings below. Therefore those findings are not regressions in the newer candidate source; they are synchronization/deployment blockers.

## Verified findings

### BACKEND-SEC-001 — Critical if stale source is deployed — Admin identity header spoofing

`EYA-Main-Backend/main` still implements Admin authorization from caller-controlled identity headers without binding the claimed Admin to a validated bearer session.

The newer `dbdnd7rn/EYA/backend` copy fixes this by validating the Supabase bearer session, deriving the user from that session, rejecting mismatched legacy identity headers and checking the Admin profile.

State: **fixed in newer app-repository backend copy; not synchronized here; not proven on Render.**

### BACKEND-SEC-002 — Critical if stale source is deployed — Delivery actor header spoofing

`EYA-Main-Backend/main` still begins delivery authorization from `x-user-id` / `x-actor-user-id`.

The newer `dbdnd7rn/EYA/backend` copy uses a bearer-derived authenticated actor and rejects mismatched legacy actor headers.

State: **fixed in newer app-repository backend copy; not synchronized here; not proven on Render.**

### BACKEND-SEC-003 — Critical if stale source is deployed — Wallet service-role routes

`EYA-Main-Backend/main` still contains functioning Wallet routes that can operate through backend service-role access.

The newer `dbdnd7rn/EYA/backend` copy installs an early `/api/wallet` HTTP 410 suspension guard before the legacy handlers, so the legacy implementations are unreachable through HTTP.

State: **fixed by route guard in newer app-repository backend copy; not synchronized here; not proven on Render.** Legacy Wallet implementations should eventually be removed after regression coverage so a future middleware refactor cannot reactivate them.

### BACKEND-SEC-004 — High — Generic/legacy PayChangu endpoints need caller inventory

The newer candidate backend still exposes generic `POST /api/paychangu/initiate` and `GET /api/paychangu/verify/:txRef` without a route-level bearer requirement. The verify path independently verifies with the provider before calling payment finalization; reconciliation does require an authenticated owner/Admin.

Current EYA source still points generic payment code at `paychangu-backend.onrender.com`, while newer ticket checkout uses the server-authoritative Edge/Cloudflare path. Therefore the Render payment service cannot simply be disabled during this audit.

State: **open dependency/security review; do not change the working payment architecture until callers are inventoried.**

### BACKEND-SEC-005 — Medium/High — Wildcard browser exposure

Both the stale mirror and newer candidate backend globally enable permissive `cors()` while the server has service-role authority.

State: **open.** Restrict browser origins only after caller inventory; native/server calls do not require wildcard browser CORS. Also add bounded request bodies and route-appropriate abuse limits.

### BACKEND-SEC-006 — Critical operational integrity — Render source provenance mismatch

Connected Render currently has two public services (`EYA-backend`, `paychangu-backend`) auto-deploying `main` from `Tchoka/EYA-backend`. The latest recorded live `EYA-backend` deploy is an April 2026 commit SHA not present in this repository. GitHub access available to this audit cannot read `Tchoka/EYA-backend`.

State: **open blocker.** A fix in either auditable repository must not be described as deployed until the Render source is reconciled. Do not suspend either Render service until dependency verification is complete.

### BACKEND-SEC-007 — Medium/High — Payment webhook log exposure

The newer candidate backend logs the full PayChangu webhook event JSON before finalization. Provider/payment/customer metadata can therefore enter infrastructure logs unnecessarily.

State: **open non-payment-behavior hardening.** Replace full-payload logging with a redacted event/reference/status audit record while preserving signature verification and provider re-verification.

## Safe branch objective

This `security/pass-1-20260822` branch should receive only security/source reconciliation work first. Do not wholesale copy the newer monolithic server in a way that silently changes payment behavior.

Recommended order:

1. identify the exact security-only delta needed for bearer-derived Admin/delivery identity and Wallet suspension;
2. port those changes here without modifying PayChangu/Cloudflare semantics;
3. add actor regression tests;
4. inventory Render/generic-payment callers;
5. reconcile the canonical source used by Render;
6. only then plan a controlled Render deployment.

No production Render service, PayChangu configuration, Cloudflare Worker or production payment route was changed by this audit branch.
