# VAC Payments Worker

Shared provider-facing payment service for EYA and future VAC applications.

This Cloudflare Worker owns PayChangu secrets, provider verification, the D1 payment ledger, webhook handling, replay/abuse controls and application payment events. Application-specific fulfilment remains in each application's trusted backend/Supabase boundary.

## Architecture boundary

The mobile application must never call this Worker with a private application secret.

```text
EYA mobile app
  -> authenticated EYA Supabase Edge Function
  -> server-authoritative EYA order reservation / amount
  -> HMAC + timestamp + one-time nonce signed request
  -> VAC Payments Worker
  -> D1 payment ledger
  -> PayChangu
```

No `EXPO_PUBLIC_*` value may contain the application HMAC secret or provider secret.

## Current branch security model

### Server-to-server authentication

Signed application requests use:

```text
x-vac-app-id: eya
x-vac-timestamp: <unix-seconds>
x-vac-nonce: <new UUID nonce>
x-vac-signature: <lowercase HMAC-SHA256>
```

Canonical input:

```text
<timestamp>.<nonce>.<HTTP_METHOD>.<URL_PATH>.<raw_request_body>
```

Controls:
- application secret looked up from `APP_SECRETS_JSON`;
- HMAC-SHA256 comparison;
- maximum five-minute clock skew;
- nonce is claimed in D1 and cannot be reused inside the replay window;
- payment-intent creation remains idempotent by application payment identity.

A valid signature is necessary but does not replace application-level amount/order authority.

### Public abuse protection

The Worker contains reusable controls for:
- bounded request bodies (default 64 KiB);
- route/IP fixed-window rate limiting backed by D1;
- no-store JSON responses;
- bounded input lengths and payment-method allowlists.

Production deployment must verify the intended limits with explicit 413/429/replay tests.

### PayChangu verification

A callback or webhook is never accepted as payment truth by itself.

The Worker:
1. locates the existing VAC payment intent;
2. requires that the provider session was successfully persisted;
3. independently queries PayChangu;
4. verifies transaction reference;
5. verifies currency;
6. rejects underpayment against the server-authoritative expected amount;
7. records the verified state idempotently.

### PayChangu webhooks

`POST /v1/webhooks/paychangu`

The handler:
- verifies HMAC-SHA256 over the exact raw request body using `PAYCHANGU_WEBHOOK_SECRET`;
- deduplicates the webhook in D1;
- extracts the transaction reference;
- independently re-verifies the transaction with PayChangu;
- records the resulting payment state;
- does not fulfil an EYA order merely because the webhook says `success`.

### Outbox and reconciliation

The branch contains:
- D1 payment-event/outbox delivery support;
- signed application callback delivery;
- retry handling;
- pending-payment verification/reconciliation support.

The EYA receiving boundary must remain idempotent and must independently bind a payment event to the expected EYA order before fulfilment. Worker -> EYA callback replay/idempotency remains an explicit security regression checkpoint.

## Payment intent creation

`POST /v1/payment-intents`

The amount must already have been calculated and reserved by EYA's trusted backend. The mobile client must not provide authoritative price/fee totals directly to the Worker.

Supported methods currently include:
- Airtel Money;
- TNM Mpamba;
- bank transfer;
- hosted card checkout.

Repeating a compatible request for the same application payment identity returns the existing intent rather than creating an independent local payment identity. Closed attempts require a new application payment ID where appropriate.

## Public payment result routes

Provider/browser return routes may display status to the customer, but redirect/query parameters are never payment evidence. The Worker re-verifies PayChangu before presenting confirmed state.

## D1

D1 is the provider-independent payment ledger for this Worker.

Migrations under `cloudflare/payments-worker/migrations` include the payment ledger and security-support tables such as request nonces/rate-limit state where required by the branch.

Always verify local migration replay before applying remote D1 migrations.

## Production secrets

Secrets belong only in Cloudflare secret/config storage, never Git or the EYA app bundle.

Sensitive values include:
- `PAYCHANGU_SECRET_KEY`;
- `PAYCHANGU_WEBHOOK_SECRET`;
- `APP_SECRETS_JSON`;
- `APP_CALLBACKS_JSON` where it contains sensitive callback authentication material.

`.dev.vars` must never be committed.

## Wallet suspension

EYA Wallet is suspended. This Worker must not introduce new Wallet top-up/credit behavior or treat Wallet as a current EYA fulfilment target. Historical payment records may remain for audit/reconciliation without reactivating Wallet balances.

## Security tests required before sensitive expansion

Keep regression coverage for:
- invalid application HMAC;
- expired timestamp;
- reused nonce;
- oversized body;
- rate-limit exhaustion;
- duplicate payment-intent request;
- invalid PayChangu webhook signature;
- duplicate webhook;
- unknown transaction reference;
- amount/currency/reference mismatch;
- provider timeout;
- missed webhook followed by reconciliation;
- duplicate/replayed Worker -> EYA application event;
- no duplicate ticket/order fulfilment.

Before refunds or organizer payouts are added here, require separate idempotency keys, replay protection, provider-reference audit, execution-time eligibility checks and reconciliation. Do not reuse customer-payment success as evidence that funds are settled and available for organizer payout.
