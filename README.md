# EYA

This repository contains the EYA Expo app, its canonical application backend, Supabase migrations and Edge Functions, and the VAC Payments Cloudflare Worker used by the app. `develop` is the integration branch for active work.

## Layout

- `app/`, `components/`, `lib/`, `providers/`: Expo app.
- `backend/`: canonical EYA application API for Vercel. Its `cloudflare/payments-worker/` directory contains the provider-facing VAC Payments Worker.
- `supabase/`: database migrations and Edge Functions. Check `supabase/migrations_pending_reconciliation/` before applying anything from that directory.
- `archive/legacy-paychangu-backend/`: previous standalone PayChangu backend, retained for reference. It is not the canonical API.

The former `EYA-Main-Backend` GitHub repository remains available as a historical source. The canonical backend source is now under `backend/` here; deployment configuration and secrets must be migrated separately before switching live services.

## Local app checks

```bash
npm ci
cp .env.example .env
npm run typecheck
npm start
```

Set the required `EXPO_PUBLIC_` values in `.env`. Never commit `.env` or provider secrets. See `backend/README.md` for the API and payment boundaries.

## Backend checks

```bash
cd backend
npm ci
npm run test:security
cd cloudflare/payments-worker
npm ci
npm run typecheck
npm run db:migrate:local
```

## Android APK

The `Android APK Validation` GitHub Action builds a release APK for `develop` and uploads it as a workflow artifact. It validates the source without publishing a production app. The EAS preview profile in `eas.json` is also configured for APK output.

Old GitHub branches and the former backend repository are retained while the consolidated app is verified. New app and backend work should target `develop`.
