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
- strict validation of the checkout reference, amount, currency, and pending status
- public PayChangu callback and failed-return routes
- HMAC-SHA256 verification of the raw PayChangu webhook body
- webhook payload deduplication in D1
- independent transaction verification through PayChangu
- exact transaction reference, currency, and amount matching
- idempotent verified transition to `paid`
- atomic creation of the `payment.paid` application outbox event
- shallow health and D1 readiness endpoints

Signed delivery of the application outbox event and atomic fulfilment inside EYA are still required. Do not deploy this Worker as a production payment service yet.

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

This verifies that the `PAYMENTS_DB` D1 binding is queryable. It also reports:

- `checkout_configured`: the PayChangu secret, callback URL, and return URL are present
- `webhook_configured`: the PayChangu webhook secret is present

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

Repeating the same signed request with the same amount, purpose, and method returns the existing D1 intent and checkout URL instead of creating another local intent. A closed failed, cancelled, or expired attempt requires a new `appPaymentId` for checkout initiation.

Standard Checkout does not guarantee that the customer uses the requested `method`; the actual provider channel must be obtained during independent verification.

A pending checkout is not proof of payment.

### Successful payment callback

```http
GET|POST /v1/paychangu/callback
```

PayChangu supplies `tx_ref`. This route never trusts the redirect parameters alone. It re-queries PayChangu, validates the reference, final status, exact amount, and currency, then returns a small browser status page.

### Failed or cancelled return

```http
GET|POST /v1/paychangu/return
```

This route also re-queries PayChangu before recording any status. A query-string value such as `status=failed` is not trusted as payment evidence.

### PayChangu webhook

```http
POST /v1/webhooks/paychangu
Signature: <paychangu-hmac-sha256>
```

The Worker:

1. computes HMAC-SHA256 over the exact raw request body using `PAYCHANGU_WEBHOOK_SECRET`;
2. compares it with the `Signature` header;
3. deduplicates the webhook by a SHA-256 payload key;
4. extracts `tx_ref`;
5. independently verifies the transaction with PayChangu;
6. requires exact reference, amount, and currency matches;
7. atomically marks the intent paid and inserts one `payment.paid` outbox event.

Duplicate successful webhooks are acknowledged without creating duplicate outbox events.

## Local configuration

`.dev.vars` must never be committed. Required values are:

```text
PAYCHANGU_SECRET_KEY=<test-secret-key>
PAYCHANGU_WEBHOOK_SECRET=<test-webhook-secret>
PAYCHANGU_CALLBACK_URL=https://<public-host>/v1/paychangu/callback
PAYCHANGU_RETURN_URL=https://<public-host>/v1/paychangu/return
APP_SECRETS_JSON={"eya":"<long-random-hmac-secret>"}
```

`PAYCHANGU_API_BASE_URL` is optional and defaults to `https://api.paychangu.com`.

The webhook URL configured in the PayChangu dashboard is:

```text
https://<public-host>/v1/webhooks/paychangu
```

## D1

The ledger schema lives in:

```text
migrations/0001_create_payment_ledger.sql
```

Local migration:

```bash
npm run db:migrate:local
```

Remote migration, only after local verification:

```bash
npm run db:migrations:list:remote
npm run db:migrate:remote
```

## Production secrets

Add production values only when deployment and fulfilment testing are ready:

```bash
npx wrangler secret put PAYCHANGU_SECRET_KEY
npx wrangler secret put PAYCHANGU_WEBHOOK_SECRET
npx wrangler secret put APP_SECRETS_JSON
npx wrangler secret put APP_CALLBACKS_JSON
```

Do not commit `.dev.vars`, PayChangu secrets, application HMAC secrets, callback URLs, or any Supabase service-role key.

## Still required before production

1. Signed and retried delivery of D1 outbox events to EYA.
2. Final EYA `payment-confirmed` Edge Function.
3. Atomic EYA order, ticket, wallet, or other fulfilment RPCs.
4. Reconciliation polling for pending transactions when a webhook is missed.
5. End-to-end test-mode payment tests.
6. Duplicate webhook, invalid signature, amount mismatch, currency mismatch, timeout, and retry tests.
7. Remote D1 migration and controlled non-production Worker deployment.
