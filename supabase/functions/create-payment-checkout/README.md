# create-payment-checkout

Authenticated EYA ticket checkout orchestration.

Required Supabase Edge Function secrets:

- `VAC_PAYMENTS_URL` — public HTTPS base URL for the VAC Payments Worker.
- `VAC_PAYMENT_CALLBACK_SECRET` — the same EYA HMAC secret stored under `eya` in the Worker's `APP_SECRETS_JSON`.

The function authenticates the caller, reserves ticket inventory with the service role, creates an HMAC-signed VAC payment intent, attaches the merchant reference to the ticket order, and returns the PayChangu hosted checkout URL.

Do not expose either secret to the Expo application.
