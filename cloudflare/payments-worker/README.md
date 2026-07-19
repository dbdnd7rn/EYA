# VAC Payments Worker

Shared payment gateway for EYA and future VAC applications. This service owns PayChangu provider secrets, provider verification, webhook processing, and the provider-independent payment ledger. Application-specific order fulfilment remains in each application's Supabase project.

## Current milestone

Payment Architecture V1 currently provides:

- Cloudflare Worker project configuration
- signed server-to-server application authentication
- replay protection with a five-minute timestamp window
- server-generated merchant references
- idempotent payment-intent creation
- a central Supabase payment ledger schema
- RLS enabled with no public client policies

PayChangu initiation, verification, webhook handling, and signed callbacks are the next implementation stage.

## Request signing

Applications must call the Worker from a trusted backend such as a Supabase Edge Function. Never place an application signing secret in the mobile app.

Required headers:

```text
x-vac-app-id: eya
x-vac-timestamp: 1784460000
x-vac-signature: <hex hmac sha256>
```

Canonical signing input:

```text
<timestamp>.<HTTP_METHOD>.<URL_PATH>.<raw_request_body>
```

Example:

```text
1784460000.POST./v1/payment-intents.{"appPaymentId":"..."}
```

The signature is a lowercase hexadecimal HMAC-SHA256 digest using the private secret registered for that application.

## Create a payment intent

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

The amount must already have been calculated and locked by the application's trusted backend. The Worker stores the expected amount and later compares it with PayChangu's independently verified amount before publishing a successful payment event.

## Local setup

```bash
cd cloudflare/payments-worker
npm install
cp .dev.vars.example .dev.vars
npm run dev
```

Apply the SQL migration to the dedicated VAC Payments Supabase project before creating intents.

Configure production secrets with Wrangler or the Cloudflare dashboard:

```bash
npx wrangler secret put PAYCHANGU_SECRET_KEY
npx wrangler secret put PAYCHANGU_WEBHOOK_SECRET
npx wrangler secret put PAYMENTS_SUPABASE_URL
npx wrangler secret put PAYMENTS_SUPABASE_SERVICE_ROLE_KEY
npx wrangler secret put APP_SECRETS_JSON
```

Do not commit `.dev.vars`, PayChangu secrets, Supabase service-role keys, or application HMAC secrets.
