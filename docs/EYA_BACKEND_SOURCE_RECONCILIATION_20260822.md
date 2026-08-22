# EYA Backend Source Reconciliation — 2026-08-22

Status: security blocker; no production deployment performed.

## Why this exists

The security pass found three materially different backend source locations:

1. `dbdnd7rn/EYA/backend` on `feat/hybrid-checkout` — the newest auditable EYA backend copy discovered during this pass.
2. `dbdnd7rn/EYA-Main-Backend` — the repository named by the EYA architecture as the intended backend repository, but its current `main` server is older/stale.
3. Render services `EYA-backend` and `paychangu-backend` — both currently configured to auto-deploy `main` from `Tchoka/EYA-backend`, whose exact source is not readable through the GitHub connection available to this audit.

A security fix in one location must not be described as deployed or production-effective until the exact Render source/deploy is reconciled.

## Security-relevant comparison

The newer `dbdnd7rn/EYA/backend/src/server.js` already contains the local hardening previously described in `EYA_SECURITY_AUDIT.md`:

- `/api/wallet/*` is intercepted before the legacy handlers and returns HTTP 410 because Wallet is suspended;
- `requireAuthenticatedUser` validates a Supabase bearer token;
- `requireAuthenticatedActor` derives the actor from the authenticated session and rejects mismatched legacy actor headers;
- `requireAdmin` derives identity from the bearer session, rejects mismatched legacy identity headers and requires an Admin profile;
- cash checkout remains pending rather than being declared paid at order creation.

The stale `dbdnd7rn/EYA-Main-Backend/src/server.js` does not contain the same complete hardening. Therefore EYA-SEC-001, EYA-SEC-005 and EYA-SEC-006 should be interpreted as:

> fixed in the newer app-repository backend copy, not yet synchronized to the intended backend repository, and not yet proven deployed on Render.

This is a source/deployment integrity problem, not evidence that the local fixes disappeared.

## Payment boundary — preserve during this reconciliation

Do not redesign or move the working payment flow during this source cleanup.

The current architecture continues to designate Cloudflare/VAC Payments as the trusted payment authority for the newer signed payment path. Render must not become a second financial source of truth merely because Render exists.

At the same time, the current EYA source still contains generic/legacy payment code that points to `paychangu-backend.onrender.com`, so the Render services must not be retired until those callers are inventoried and either migrated or proven unused.

No payment route, provider secret, Cloudflare Worker, PayChangu configuration or production Render service was changed in this pass.

## Remaining backend findings

Even the newer app-repository backend still needs separate hardening/review:

- generic `POST /api/paychangu/initiate` and `GET /api/paychangu/verify/:txRef` remain reachable without a bearer requirement at the route itself;
- the verify path performs provider verification and then payment finalization, so dependency/ownership semantics must be understood before changing it;
- global permissive CORS remains enabled;
- full PayChangu webhook event JSON is written to logs and should be reduced/redacted;
- legacy Wallet handler implementations still exist later in the file even though the early HTTP 410 guard makes them unreachable; they should eventually be removed after regression coverage so future refactors cannot accidentally bypass the guard.

## Safe next steps

1. Treat `dbdnd7rn/EYA/backend` as the candidate newer implementation, not automatically as production truth.
2. Produce a file-by-file diff against `dbdnd7rn/EYA-Main-Backend`.
3. Synchronize security-only/backend-authority fixes onto an isolated branch of `EYA-Main-Backend` without changing the payment architecture.
4. Determine how `Tchoka/EYA-backend` relates to the two auditable copies before any Render deployment.
5. Regression-test Admin, Delivery Agent, vendor-owner, normal User and anonymous actors.
6. Only after dependency verification decide whether the two Render services remain necessary.

## Production safety

Until this is resolved:

- do not claim a local backend fix is live merely because it exists in Git;
- do not suspend or delete either Render service;
- do not change PayChangu/Cloudflare behavior as part of source cleanup;
- do not run a blanket production Supabase migration push while EYA-SEC-017 remains open.
