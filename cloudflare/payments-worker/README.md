# VAC Payments Worker

Shared payment gateway for EYA and future VAC applications. This service owns PayChangu provider secrets, provider verification, webhook processing, and the provider-independent payment ledger. Application-specific order fulfilment remains in each application's own backend and Supabase project.

## Current milestone

Payment Architecture V1 currently provides:

- Cloudflare Worker project configuration
- Cloudflare D1 as the single central payment ledger
- signed server-to-server application authentication
- five-minute signed-request replay window
- server-generated merchant references
- idempotent payment-intent creation
- webhook inbox storage with provider event deduplication
- application callback outbox storage with retry tracking
- shallow health and D1 readiness endpoints

PayChangu initiation, provider verification, webhook processing, and signed application callbacks are the next implementation stage. Do not deploy this Worker as a production payment service yet.

## Architecture boundary

The mobile application must never call this Worker with a private application secret. EYA calls the Worker only from a trusted Supabase Edge Function.

```text
EYA mobile app
  -> authenticated EYA Edge Function
  -> HMAC-signed request to VAC Payments Worker
  -> D1 payment ledger
  -> PayChangu
```

A second payment Supabase project is not used. D1 is the payment ledger. EYA's Supabase project remains responsible for EYA orders, tickets, wallets, and final fulfilment.

## Request signing

Required headers:

```text
x-vac-app-id: eya
x-vac-timestamp: 1784460000
x-vac-signature: <lowercase hex hmac sha256>
```

Canonical signing input:

```text
<timestamp>.<HTTP_METHOD>.<URL_PATH>.<raw_request_body>
```

Example:

```text
1784460000.POST./v1/payment-intents.{"appPaymentId":"..."}
```

The signature is an HMAC-SHA256 digest using the private secret registered for that application in `APP_SECRETS_JSON`.

## Endpoints

### Health

```http
GET /health
```

This is a shallow process check and does not query D1.

### Readiness

```http
GET /ready
```

This verifies that the `PAYMENTS_DB` D1 binding is available and queryable.

### Create a payment intent

```http
POST /v1/payment-intents
Content-Type: application/json
x-vac-app-id: eya
x-vac-timestamp: <unix-seconds>
x-vac-signature: <signature>
```

```json
{
  "appPaymentId": "eya-payment-intent-uuid",
  "appUserId": "eya-user-uuid",
  "purpose": "ticket_purchase",
  "method": "mpamba",
  "amountMwk": 15000,
  "customerEmail": "customer@example.com",
  "customerPhone": "0888123456",
  "title": "EYA ticket purchase",
  "description": "Two standard tickets",
  "metadata": {
    "eventId": "event-uuid"
  }
}
```

The amount must already have been calculated and locked by the application's trusted backend. The Worker stores the expected amount and will later compare it with the amount independently verified from PayChangu.

## Create and bind D1

From the Worker directory:

```bash
cd cloudflare/payments-worker
npm install
npm run db:create
```

When Wrangler asks whether it should add the database to the configuration, choose **Yes**. When it asks for the binding name, enter:

```text
PAYMENTS_DB
```

Wrangler will add the real D1 UUID to `wrangler.jsonc`. `wrangler.d1.example.jsonc` shows the expected final structure but contains no usable database ID.

## Apply migrations

Local development database:

```bash
npm run db:migrate:local
```

Remote Cloudflare D1 database:

```bash
npm run db:migrations:list:remote
npm run db:migrate:remote
```

The ledger schema lives in:

```text
migrations/0001_create_payment_ledger.sql
```

## Local secrets

Copy the template:

```bash
cp .dev.vars.example .dev.vars
```

Configure development-only values in `.dev.vars`. Never commit that file.

## Production secrets

These will be added only when the corresponding implementation stage is ready:

```bash
npx wrangler secret put PAYCHANGU_SECRET_KEY
npx wrangler secret put PAYCHANGU_WEBHOOK_SECRET
npx wrangler secret put APP_SECRETS_JSON
npx wrangler secret put APP_CALLBACKS_JSON
```

Do not commit `.dev.vars`, PayChangu secrets, application HMAC secrets, callback URLs, or any Supabase service-role key.

## Before production deployment

The following must be completed and tested first:

1. PayChangu checkout initiation.
2. PayChangu webhook signature verification.
3. Independent provider transaction verification.
4. Exact amount and currency matching.
5. Idempotent transition from pending to paid.
6. Signed callback delivery to EYA.
7. Atomic EYA order or ticket fulfilment.
8. Replay, duplicate webhook, timeout, and retry tests.
