# PayChangu Backend

Standalone backend for the `Pa-Level` mobile app PayChangu checkout flow.

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
2. Set `PAYCHANGU_SECRET_KEY`
3. Set `PAYCHANGU_WEBHOOK_SECRET`
4. Set `SUPABASE_URL`
5. Set `SUPABASE_SERVICE_ROLE_KEY`
6. Set `SUPABASE_NEW_APP_SCHEMA` if your campus-market schema is not `campus_market`
7. Set `PUBLIC_BASE_URL` to the public URL where this backend is reachable
8. Run `npm install`
9. Run `npm start`

## Mobile app value

Point the Expo app env var `EXPO_PUBLIC_PAYCHANGU_BACKEND` to this backend's public base URL.

## Notes

- This backend uses PayChangu standard checkout at `POST https://api.paychangu.com/payment`
- It verifies transactions through `GET https://api.paychangu.com/verify-payment/{tx_ref}`
- The success and cancel pages are intentionally hosted on this backend so the mobile `WebView` can detect `/pay/success` and `/pay/cancel` reliably
- Payment truth lives on the backend in `public.payments`
- Wallet top-ups are finalized by the backend, not the mobile app
- Market and food orders are created by the backend after verified payment
- Paid market and food orders receive a delivery handoff pass with:
  - invoice reference
  - 6-digit delivery PIN
  - QR token
- The rider can verify handoff through the backend using the PIN or QR token
