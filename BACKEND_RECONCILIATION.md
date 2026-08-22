# EYA Backend Reconciliation

Status: canonical Vercel candidate assembled on `reconcile/eya-main-backend-20260822`; production cutover not yet performed.

## Production target

- EYA application backend: **Vercel**
- Auth/data/RLS/RPC: **Supabase**
- Provider-facing payments: **VAC Payments on Cloudflare**
- Render: legacy only during migration; retire after remaining callers are removed

## Current canonical runtime

- `index.js` exports the canonical Express app for Vercel and never calls `app.listen()`.
- `src/server-v2.js` owns the canonical route surface.
- `src/local-server.js` starts that same canonical app for local Node development.
- `npm start` and `npm run dev` now use the canonical runtime rather than the historical Render gateway.
- Historical `/api/paychangu/*` and provider browser-return routes are terminally rejected by the Vercel app.
- Wallet routes remain terminally rejected.
- Permanent ticket-code Admin check-in remains terminally rejected.

## Preserved architecture and security invariants

- Wallet is suspended product-wide.
- Permanent ticket IDs/codes are support/reference values only and never gate authority.
- Ticket admission remains `issued ticket -> short-lived live credential -> rotating QR -> trusted atomic gate verification`.
- COD remains pending until verified handoff.
- Admin/delivery identity is derived from a validated Supabase session, never caller-supplied actor headers.
- Cloudflare/VAC Payments remains payment authority. Vercel does not own PayChangu secrets, provider webhooks or provider verification.
- No blanket production Supabase migration push is part of this work.

## Canonical application routes

The Vercel candidate includes the valid EYA-specific server surfaces required by the caller inventory:

- authenticated Admin commerce/support operations;
- Admin vendor/catalog/housing/user/broadcast operations;
- Delivery Agent dispatch/assignment/status operations;
- COD checkout and order handoff;
- read-only ticket event/order/My Tickets convenience APIs without static admission QR generation;
- encrypted ticket-organization payout-destination intake.

The canonical server deliberately excludes competing Node ticket-payment authority and static permanent-code admission.

## Payment boundary

Cloudflare/VAC Payments remains the provider boundary for Airtel Money, TNM Mpamba, bank transfer and card.

The temporary generic marketplace/food payment bridge remains isolated while those callers are migrated to VAC Payments. Do not point that bridge at Vercel because the canonical Vercel app intentionally returns HTTP 410 for historical Node PayChangu routes.

## Environment placement

### Vercel

- `PUBLIC_BASE_URL`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_NEW_APP_SCHEMA`
- `ADMIN_EMAILS` where used as a secondary allowlist
- `EXPO_PUSH_ACCESS_TOKEN`
- `PAYOUT_DESTINATION_ENCRYPTION_KEY_B64`
- `PAYOUT_DESTINATION_ENCRYPTION_KEY_VERSION`
- VAC app/callback credentials only where Vercel is explicitly the trusted caller/receiver

### Cloudflare

- PayChangu provider credentials
- VAC application-secret mapping
- provider webhook/callback verification material
- D1 payment ledger, replay and rate-limit state

Never expose server credentials through `EXPO_PUBLIC_*` or `NEXT_PUBLIC_*` variables.

## App configuration cutover

The EYA app now separates:

- `EXPO_PUBLIC_EYA_API_URL` / `NEXT_PUBLIC_EYA_API_URL` for the Vercel EYA application backend;
- `EXPO_PUBLIC_LEGACY_PAYMENT_BACKEND_URL` / `NEXT_PUBLIC_LEGACY_PAYMENT_BACKEND_URL` only for the temporary generic-commerce payment bridge.

The tracked app `.env` file was removed from Git because `.env` is already ignored. `.env.example` remains the safe configuration template.

## Validation checkpoint

GitHub Actions `Reconciliation Check` run 23 completed successfully on commit `8fd6770b43d432b07dd4a252f3ad2e7a6eec13c7` after the canonical Vercel runtime became the default local start path. The workflow validates syntax for the Vercel export/canonical modules and runs the Wallet, ticket-admission, COD and route-surface regression suite.

This is source/CI validation only. It is not a production deployment claim.

## Vercel cutover checkpoint

The connected Vercel account currently has no dedicated `EYA-Main-Backend` / EYA API project. Existing projects are unrelated and must not be repurposed.

Create/import a dedicated Vercel project from `dbdnd7rn/EYA-Main-Backend`, deploy this reconciliation branch as **Preview** first, configure only the Vercel-side environment variables above, then smoke-test:

- `/health`;
- authenticated Admin routes;
- delivery assignment/status;
- COD checkout and verified handoff;
- ticket reads;
- ticket-finance payout-destination intake;
- Wallet and static ticket-code routes returning the intended 410 responses.

Only after Preview validation should the app's EYA API URL move to the verified Vercel deployment.

## Remaining blockers

1. Create/import the dedicated Vercel backend project and run Preview smoke tests.
2. Migrate the remaining generic marketplace/food payment caller from the legacy Render bridge to VAC Payments on Cloudflare.
3. Keep the Supabase migration-history blocker open; no blanket production `db push`.
4. Finish payment direct-insert authority and notification-integrity hardening.
5. Retire Render only after no app/environment caller depends on it.
