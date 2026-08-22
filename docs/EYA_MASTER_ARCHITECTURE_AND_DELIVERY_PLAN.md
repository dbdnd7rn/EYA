# EYA Master Architecture & Delivery Plan

Last reconciled: 2026-08-22
Branch: `feat/hybrid-checkout`

This document is the top-level delivery map for EYA. Detailed ticketing, workspace and security decisions remain in their dedicated ledgers, but this file defines the system boundaries, priority order and rules that apply across the entire product and both repositories.

## 1. System scope

EYA is one product implemented across two repositories and several trusted infrastructure boundaries.

### EYA app / Supabase repository

Repository: `dbdnd7rn/EYA`

Responsibilities:
- Expo / React Native user experience;
- Personal/User and verified workspace UI;
- Supabase schema, RLS, migrations and transactional RPCs;
- Supabase Edge Functions;
- EYA-specific order, ticket, fulfilment and audit state.

### EYA Main Backend repository

Repository: `dbdnd7rn/EYA-Main-Backend`

Responsibilities:
- shared or privileged backend services that do not belong in the mobile client;
- VAC Payments Cloudflare Worker and D1 payment ledger;
- PayChangu provider secrets, provider verification, webhooks, outbox and reconciliation;
- Render-hosted services when a long-running/heavier server runtime is a better fit than Edge Functions or Workers.

Both repositories must be threat-modeled and tested as one system. A secure component does not make an insecure cross-service boundary safe.

## 2. Server-authority rule

The frontend may request an action and render its result. It is never the authority for:
- identity or authorization;
- Admin status or workspace permission;
- prices, fees, totals or balances;
- payment success;
- ticket fulfilment;
- refunds;
- reserves or liabilities;
- organizer payout eligibility;
- payout execution;
- privileged state transitions.

`EXPO_PUBLIC_*` / `NEXT_PUBLIC_*` values are public by definition. They must never contain or function as private authorization secrets.

## 3. Backend placement rule

Choose the smallest trusted backend that can enforce the invariant safely.

### PostgreSQL / Supabase RPC
Use for:
- atomic transactional invariants;
- ownership checks tied to `auth.uid()`;
- row/state transitions that must commit with database changes;
- RLS-enforced reads and scoped user operations.

A client-callable RPC is acceptable only when it derives identity from the session, validates exact resource ownership/permission, bounds inputs, fixes `search_path` where relevant, and cannot be used as an arbitrary privileged primitive.

### Supabase Edge Functions
Use for:
- authenticated privileged orchestration close to EYA data;
- operations requiring service-role access that should not be callable as a raw browser RPC;
- secret-backed integrations;
- signing requests to another trusted backend;
- sensitive organizer-finance intake such as encrypted payout destination details.

### Cloudflare Workers / D1
Use for:
- PayChangu provider boundary;
- public webhook/callback endpoints;
- HMAC-authenticated server-to-server payment commands;
- replay protection, rate limiting and bounded public request handling;
- provider-independent payment ledger, verification, reconciliation and outbox delivery.

### Render
Use when needed for:
- longer-running/heavier backend jobs;
- libraries or runtimes unsuitable for Edge/Worker environments;
- controlled worker/queue processing or other server workloads that need a persistent Node/server runtime.

Do not move working payment authority from Cloudflare to Render merely because Render exists. Do not duplicate the same financial source of truth in multiple backends.

## 4. Identity and workspaces

One person has one normal EYA account.

Personal/User access remains available to every authenticated EYA account. Specialized capabilities are additional verified workspaces rather than replacement identities:
- Landlord;
- Food Provider;
- Delivery Agent;
- Ticket Management;
- Admin.

Ticket Management belongs to the normal EYA account and is linked to a stable Promoter / Organization. Workspace visibility is UI only; the server remains the authorization boundary.

The legacy single `profiles.role` model is migration compatibility, not the long-term authorization architecture.

## 5. Wallet is suspended

Wallet and wallet-backed payment functionality are suspended product-wide.

Rules:
- users must not see Wallet UI;
- users must not be able to navigate directly into a working Wallet route;
- no checkout may offer Wallet as a payment method;
- no client RPC/table access may mutate or spend Wallet balances;
- historical Wallet rows may remain for audit/reconciliation;
- delayed historical payment verification must not silently reactivate or credit the Wallet;
- no new feature may depend on Wallet until suspension is explicitly reversed through a new product/security decision.

## 6. Payment architecture to preserve

Current trusted direction:

```text
EYA mobile app
    -> authenticated EYA Edge Function
    -> server-authoritative order reservation / amount
    -> HMAC + timestamp + nonce signed request
    -> VAC Payments Cloudflare Worker
    -> D1 payment ledger
    -> PayChangu

PayChangu webhook/callback
    -> Worker validates webhook where applicable
    -> Worker independently re-verifies transaction with PayChangu
    -> reference / currency / amount / status checks
    -> idempotent paid transition
    -> signed/retried application outbox event
    -> EYA atomic fulfilment
```

Never fulfil from client redirects, screenshots, callback query parameters, raw webhook claims, or a client-supplied amount.

## 7. Security threat model

The security program covers at least:

### Authentication and session attacks
- credential stuffing and brute force;
- leaked passwords;
- session/refresh-token theft;
- account takeover and hijacking;
- password-reset/OAuth redirect abuse;
- privileged Admin account compromise;
- stale or improperly revoked sessions.

### Authorization attacks
- IDOR/BOLA and cross-user record access;
- horizontal privilege escalation;
- vertical privilege escalation;
- self-promotion to Admin/workspace roles;
- direct-route bypass of hidden UI;
- insecure `SECURITY DEFINER` functions;
- over-broad table grants or missing RLS.

### Injection and content attacks
- SQL injection / unsafe dynamic SQL;
- command/template injection where applicable;
- XSS on web-rendered surfaces;
- malicious rich text/content;
- SSRF or unsafe backend URL fetching;
- malicious deep links and redirect injection.

### Financial attacks
- price/quantity/fee tampering;
- fake payment success;
- webhook spoofing;
- request replay;
- duplicate fulfilment;
- payout/refund replay;
- race conditions and double-spend style concurrency;
- payout-destination substitution;
- reserve/liability bypass;
- cancellation after payout.

### Abuse and availability
- oversized request bodies/uploads;
- API flooding and denial of service;
- reservation/payment-intent spam;
- scanner brute force;
- notification/message spam;
- unbounded queries or expensive RPC abuse.

### Data and infrastructure
- secrets committed to Git or embedded in the app;
- sensitive values in logs/errors;
- insecure file uploads;
- dependency/supply-chain vulnerabilities;
- misconfigured Cloudflare/Render/Supabase permissions;
- backup/restore and incident-response gaps;
- insufficient audit trails and monitoring.

Security findings and remediation state belong in `EYA_SECURITY_AUDIT.md`.

## 8. Migration-history safety blocker

The live Supabase migration history and the repository migration filenames are currently not fully aligned for part of the 2026-08-22 security/finance work.

Examples include live versions in the `2026082214xxxx` / `2026082215xxxx` range while similar repository files were saved with later `2026082217xxxx` / `18xxxx` / `19xxxx` / `20xxxx` versions.

Rule until reconciled:

> DO NOT run an ordinary blanket `supabase db push` against production from this branch.

Why:
- Supabase keys migration identity by version;
- a logically duplicate migration with a different version can be treated as new;
- re-running non-idempotent `create policy`, DDL or grant changes can fail or create unsafe drift.

Required reconciliation:
1. export the exact live migration versions/statements retained in `supabase_migrations.schema_migrations`;
2. compare them with Git migration files;
3. restore exact live migrations to Git where missing;
4. keep only genuinely new pending migrations after the latest live version;
5. remove/rename duplicate re-authored migrations only after content comparison;
6. run local migration reset/replay on a disposable database;
7. compare local schema to production before resuming normal push workflow.

Do not rewrite production migration history merely to make filenames prettier.

## 9. Ticketing / organizer finance status

Implemented foundations include:
- one-account Ticket Management workspace;
- stable Promoter / Organization ownership;
- immutable event/ticket approval integrity;
- proposed-change revision workflow;
- rotating admission credentials;
- ticket account transfer foundation;
- Early Payout / Final Settlement accounting foundation;
- separate Finance / Settlement entitlement;
- verified payout-destination data model and masked access foundation;
- immutable organization liability ledger with idempotency, reversals and serialized posting.

These foundations do NOT authorize real organizer payouts yet.

## 10. Remaining blockers before real organizer money moves

1. Provider-settled / actually-available funds authority. `customer paid` is not enough.
2. First-class ticket refund lifecycle.
3. Confirm PayChangu refund/reversal process for every supported payment rail.
4. Automatic event cancellation -> finance freeze/reconciliation behavior.
5. Execution-time payout revalidation immediately before money leaves.
6. Automatically apply organization-level liability/offset to payout eligibility.
7. Deploy and verify trusted encrypted payout-destination intake and key rotation.
8. Decide EYA commercial fee model and who bears provider/payout/refund fees.
9. Decide final-settlement grace/dispute/refund window.
10. Implement real payout executor with idempotency, replay protection, provider reference audit and reconciliation.

## 11. Delivery order from this checkpoint

### Phase A — make the repository trustworthy
1. Reconcile Supabase migration history.
2. Reconcile stale architecture/status documentation.
3. Update `EYA-Main-Backend` documentation to the current EYA/VAC architecture and Wallet suspension.

### Phase B — finish security baseline
1. Classify remaining `SECURITY DEFINER` warnings and move high-impact primitives behind Edge/service role where appropriate.
2. Fix remaining mutable `search_path` functions.
3. Verify Worker -> EYA outbox callback replay/idempotency boundary.
4. Audit auth/session reset/OAuth/deep-link behavior and privileged-account protection.
5. Audit uploads, URLs, XSS/SSRF, input bounds and file validation.
6. Audit dependencies, secrets, logs and monitoring.
7. Regression-test anonymous, User, Landlord, Food Provider, Delivery Agent, Ticket Management, Finance and Admin actors.

### Phase C — finish organizer finance safety
1. Provider settlement authority.
2. Refund lifecycle + credential invalidation.
3. Cancellation freeze/reconciliation.
4. Organization liability automatic offset.
5. Fee model + settlement grace decisions.
6. Real payout executor.

### Phase D — product completion / polish
1. Finish user-facing revision wording (`Current live` / `Proposed changes`).
2. Remove legacy static admission paths.
3. Make transferred issued-ticket ownership authoritative in My Tickets.
4. Add event-scoped scanner staff.
5. Resolve app-first external ticket recipient flow and offline fallback policy.
6. Continue Ticket Studio templates, tiers, attendee/staff/check-in polish.
7. Complete phone regression board and controlled deployment testing.

## 12. Source-of-truth hierarchy

Use these together:
1. `EYA_MASTER_ARCHITECTURE_AND_DELIVERY_PLAN.md` — whole-system boundary and priority order.
2. `EYA_SECURITY_AUDIT.md` — attack findings and security remediation state.
3. `EYA_ACCOUNT_WORKSPACE_IDENTITY_MODEL.md` — account/workspace authorization model.
4. `TICKETING_DECISION_ARCHITECTURE_LEDGER.md` — ticketing/finance product decisions and blockers.
5. `TICKETING_BUILD_TEST_BOARD.md` — phone/server regression checkpoints, not product-policy authority.

When documents disagree with verified implementation, reconcile the documents immediately rather than silently choosing whichever is convenient.
