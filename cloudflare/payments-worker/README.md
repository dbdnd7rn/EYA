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
- PayChangu Standard Checkout initiation
- strict validation of the returned transaction reference, amount, currency, and pending status
- idempotent storage and reuse of hosted checkout URLs
- webhook inbox storage with provider event deduplication
- application callback outbox storage with retry tracking
- shallow health and D1 readiness endpoints

Provider verification, webhook processing, and signed application callbacks are the next implementation stage. Do not deploy this Worker as a production payment service yet.

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

This verifies that the `PAYMENTS_DB` D1 binding is available and queryable. The response also reports `checkout_configured`, which is true only when the PayChangu secret, callback URL, and return URL are present.

### Create a payment intent and hosted checkout

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

The amount must already have been calculated and locked by the application's trusted backend. The Worker stores the expected amount, creates a PayChangu Standard Checkout session, validates the provider response, and returns the hosted checkout URL.

```json
{
  "status": "success",
  "created": true,
  "checkout_created": true,
  "payment_intent": {
    "id": "payment-intent-uuid",
    "app_id": "eya",
    "app_payment_id": "eya-payment-intent-uuid",
    "merchant_reference": "eya_...",
    "provider_reference": "eya_...",
    "expected_amount_mwk": 15000,
    "currency": "MWK",
    "method": "mpamba",
    "status": "pending",
    "checkout_url": "https://checkout.paychangu.com/..."
  }
}
```

Repeating the same signed request with the same amount, purpose, and method returns the existing D1 intent and checkout URL instead of creating another local intent. A closed failed, cancelled, or expired attempt requires a new `appPaymentId`.

Standard Checkout does not guarantee that the customer uses the requested `method`; the actual provider channel must be obtained during independent verification.

A pending checkout is not proof of payment. No order, ticket, wallet, or other value may be fulfilled until the later webhook handler independently verifies the transaction with PayChangu and matches the reference, final status, amount, and currency.

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

Copy the template only when creating a new local environment:

```bash
cp .dev.vars.example .dev.vars
```

Configure development-only values in `.dev.vars`. Never commit that file.

Required for checkout initiation:

```text
PAYCHANGU_SECRET_KEY=<test-secret-key>
PAYCHANGU_CALLBACK_URL=https://<public-host>/v1/paychangu/callback
PAYCHANGU_RETURN_URL=https://<public-host>/v1/paychangu/return
APP_SECRETS_JSON={"eya":"<long-random-hmac-secret>"}
```

`PAYCHANGU_API_BASE_URL` is optional and defaults to `https://api.paychangu.com`.

The callback and return routes are not implemented yet. Do not initiate a real payment until those routes and independent verification have been added and tested.

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

1. PayChangu callback and return routes.
2. PayChangu webhook signature verification.
3. Independent provider transaction verification.
4. Exact reference, status, amount, and currency matching.
5. Idempotent transition from pending to paid.
6. Signed callback delivery to EYA.
7. Atomic EYA order or ticket fulfilment.
8. Replay, duplicate webhook, timeout, and retry tests.
