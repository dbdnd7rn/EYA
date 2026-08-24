# Online Tourism hosted checkout

Online Tourism uses the shared VAC Payments Worker only through the provider-hosted PayChangu checkout path.

## Application contract

- `app_id`: `online-tourism`
- `purpose`: `subscription`
- `method`: `hosted_checkout`
- supported currencies: `MWK`, `USD`
- `amountMinor`: whole kwacha for MWK; cents for USD

Examples:

- MWK 8,500 -> `amountMinor: 8500`, `currency: "MWK"`
- USD 5.00 -> `amountMinor: 500`, `currency: "USD"`

The Worker converts USD cents to PayChangu major units before creating the hosted checkout and converts verified provider amounts back to cents before matching the payment intent.

Online Tourism must call the Worker from a trusted backend/Edge Function using the VAC application HMAC secret. The browser must never receive that secret.

After provider verification, VAC Payments emits a signed `payment.paid` outbox event containing the server-authoritative `amount_minor` and `currency`. Online Tourism activates or renews the subscription only after validating that event against its own pending subscription payment order.

EYA direct Airtel Money, TNM Mpamba and bank-transfer flows remain MWK-only and are not changed by this integration.
