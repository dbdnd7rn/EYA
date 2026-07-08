# PayChangu Backend

Standalone backend for the `EYA` mobile app PayChangu checkout flow.

## Routes

- `GET /health`
- `POST /api/paychangu/initiate`
- `GET /api/paychangu/verify/:txRef`
- `POST /api/paychangu/webhook`
- `GET /api/orders/:orderId/handoff`
- `POST /api/orders/:orderId/handoff/verify`
- `GET /pay/success`
- `GET /pay/cancel`

## Setup

1. Copy `.env.example` to `.env`
2. Set `PAYCHANGU_SECRET_KEY` to the PayChangu secret key from the merchant dashboard
3. Set `PAYCHANGU_PUBLIC_KEY` to the matching public key for reference
4. Set `PAYCHANGU_WEBHOOK_SECRET` to the webhook secret from PayChangu
5. Set `PAYCHANGU_CALLBACK_URL` to this backend's public success callback, for example `https://your-backend.example.com/pay/success`
6. Set `PAYCHANGU_RETURN_URL` to this backend's public cancel/failed return URL, for example `https://your-backend.example.com/pay/cancel`
7. Set `SUPABASE_URL`
8. Set `SUPABASE_SERVICE_ROLE_KEY`
9. Set `SUPABASE_NEW_APP_SCHEMA` if your campus-market schema is not `public`
10. Set `PUBLIC_BASE_URL` to the public URL where this backend is reachable
11. Run `npm install`
12. Run `npm start`

## Mobile app value

Point the Expo app env var `EXPO_PUBLIC_PAYCHANGU_BACKEND` to this backend's public base URL.

## Notes

- This backend uses PayChangu standard checkout at `POST https://api.paychangu.com/payment`
- It verifies transactions through `GET https://api.paychangu.com/verify-payment/{tx_ref}`
- Direct mobile-money payments use `POST https://api.paychangu.com/mobile-money/payments/initialize`
- All PayChangu API calls are server-side and use `Authorization: Bearer ${PAYCHANGU_SECRET_KEY}`
- Never add `PAYCHANGU_SECRET_KEY` to the Expo/mobile `.env`; the app only needs `EXPO_PUBLIC_PAYCHANGU_BACKEND`
- The success and cancel pages are intentionally hosted on this backend so the mobile `WebView` can detect `/pay/success` and `/pay/cancel` reliably
- Payment truth lives on the backend in `public.payments`
- Wallet top-ups are finalized by the backend, not the mobile app
- Market and food orders are created by the backend after verified payment
- Paid market and food orders receive a delivery handoff pass with:
  - invoice reference
  - 6-digit delivery PIN
  - QR token
- The rider can verify handoff through the backend using the PIN or QR token
