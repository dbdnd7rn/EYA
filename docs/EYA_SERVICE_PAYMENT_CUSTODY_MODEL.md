# EYA Service Payment & Custody Model

Last reconciled: 2026-08-23
Branch: `security/pass-1-20260822`

Status: `DECIDED DIRECTION`

This document records the product/architecture decision that EYA should not become the financial settlement middleman for every third-party service in the app.

The core principle is:

> EYA should hold/control customer money only where the product, contractual relationship, refund/cancellation risk, and settlement workflow genuinely require it.

This decision reduces manual settlement burden, third-party-money custody risk, operational support load, and unnecessary payment complexity.

---

## 1. Service-by-service direction

### Tickets

Status: `KEEP EYA-CONTROLLED COLLECTION / SETTLEMENT MODEL`

Ticketing remains the exception where EYA may control collection and organizer settlement because:
- EYA has an explicit Ticket Management relationship/agreement with the organizer/promoter;
- ticket sales require cancellation/refund protection;
- organizer Early Payout / Final Settlement requires reserve and reconciliation controls;
- EYA must be able to stop organizer payout if the event is cancelled/frozen or liabilities arise;
- admission/ticket fulfilment depends on verified payment state;
- event-level finance and audit are part of the Ticket Management product.

The existing ticket direction therefore remains:

`Customer -> EYA-controlled ticket checkout -> verified collection -> event ledger -> protected reserve/holds -> controlled organizer settlement`

This is not a general EYA Wallet and must not revive the suspended Wallet product.

Do not weaken the current ticket payment authority simply to make it resemble other EYA services.

---

### Food

Status: `PRODUCT UNDER REVIEW; DO NOT BUILD NEW EYA MONEY-CUSTODY FLOW`

Food may be removed from EYA entirely.

Until the product decision is final:
- do not invest in a new EYA-held food-payment balance;
- do not build manual EYA-to-restaurant settlement workflows;
- do not treat EYA as the merchant holding restaurant proceeds;
- do not expand provider payout logic for Food;
- do not spend migration/security effort polishing a payment custody model that may be retired.

If Food remains in EYA, preferred direction is **non-custodial**:
- restaurant/provider receives its customer money directly through an approved direct-payment/handoff mechanism; or
- payment happens outside EYA / cash-on-delivery / direct merchant collection where appropriate;
- EYA may separately charge its own platform/service/subscription/listing fee if a business model requires it;
- EYA must not manually receive the restaurant's proceeds and later redistribute them.

Important payment-truth rule if Food remains:
- a restaurant/provider action must never manufacture `paid` status for an unpaid order;
- if EYA cannot cryptographically/provider-verify a direct merchant payment, the UI should describe it as handled directly with the provider rather than claiming EYA verified payment.

The existing `approve_food_order_payment` payment-authority issue remains known, but no new work should be prioritized on it while Food removal/retention is unresolved unless it is still exposed in production and creates an active security risk.

---

### Marketplace

Status: `PRODUCT UNDER REVIEW; DO NOT BUILD NEW EYA MONEY-CUSTODY FLOW`

Marketplace may be removed from EYA entirely.

Until the product decision is final:
- do not expand EYA-held Marketplace settlement;
- do not create manual seller payout queues;
- do not make EYA responsible for holding seller proceeds;
- do not build a generic EYA seller wallet;
- do not couple Marketplace to ticket-style settlement rules.

If Marketplace remains, preferred direction is **seller-direct/non-custodial**:
- buyer pays seller directly using a supported seller-owned/direct payment method or external handoff;
- seller gets access to its money without waiting for EYA staff to manually settle it;
- EYA may charge its own marketplace fee/subscription/listing/advertising fee separately;
- if the payment provider later supports trustworthy automatic split settlement/direct connected merchants, that may be evaluated, but EYA should still avoid becoming the manual custodian of seller money.

Do not implement an EYA-controlled pooled merchant balance just to preserve the current generic commerce payment bridge.

---

### Rooms / Landlords

Status: `PRODUCT UNDER REVIEW; NO LANDLORD RENT/DEPOSIT CUSTODY`

Rooms/Landlords may also be removed from EYA.

Whether the listing product stays or not, EYA should **not hold landlord rent, deposits, or accommodation proceeds** in the current direction.

If Rooms remains:
- EYA may provide discovery, listing, verification, messaging, enquiry, reservation-request or contact workflows;
- tenant rent/deposit/payment goes directly to the landlord/property operator through their own agreed method;
- EYA should not receive rent and later manually pay landlords;
- EYA may charge landlords EYA-owned fees such as subscription, verification, listing promotion or other platform fees;
- any future booking/reservation fee that belongs to EYA must be clearly separated from landlord rent/deposit money.

This reduces disputes about accommodation quality, deposits, tenancy terms, chargebacks, landlord settlement and manual reconciliation.

---

## 2. Whole-EYA custody rule

EYA should distinguish two categories of money:

### A. Money owed to EYA

Examples:
- EYA subscription fee;
- verification fee;
- listing/promotion fee;
- platform-owned service fee where legally/product-wise appropriate.

EYA may collect these directly because EYA is the actual payee.

### B. Money owed to a third-party provider

Examples:
- restaurant order proceeds;
- Marketplace seller proceeds;
- landlord rent/deposit;
- other merchant/provider proceeds.

Default rule:

**Do not route these funds into an EYA-controlled pooled balance that requires EYA staff to manually settle the provider later.**

Tickets are the explicit current exception because the organizer relationship and event-risk model require controlled settlement.

---

## 3. Why this direction is preferred

Avoiding unnecessary third-party-money custody reduces:
- manual payout workload;
- seller/provider complaints about delayed money;
- reconciliation burden;
- fraud exposure;
- chargeback/refund complexity;
- operational dependence on EYA staff being online to settle providers;
- legal/compliance risk associated with behaving like a general-purpose money holder;
- pressure to revive a global EYA Wallet.

It also lets each service use the simplest appropriate commercial model instead of forcing every vertical into the ticket settlement architecture.

---

## 4. VAC Payments / Cloudflare impact

VAC Payments remains the shared secure payment infrastructure where EYA legitimately needs payment orchestration.

However, **shared infrastructure does not mean shared custody model**.

Current direction:
- Tickets -> VAC Payments remains the provider-facing collection authority for EYA-controlled ticket payments.
- EYA-owned fees -> VAC Payments may be reused where appropriate.
- Food/Marketplace/Rooms third-party proceeds -> do not automatically route through an EYA-held settlement balance merely because VAC Payments exists.

If Food/Marketplace/Rooms are removed, retire their unused payment callers and the legacy generic commerce payment bridge after verifying no legitimate dependencies remain.

If one remains, design its direct-merchant payment approach separately and do not weaken ticket security/settlement controls.

---

## 5. Current engineering rule while product review is open

Until the keep/remove decision is final for Food, Marketplace and Rooms:

1. Freeze new payment-custody feature work for those verticals.
2. Do not build new provider payout/settlement systems for them.
3. Only fix an existing issue if it creates an active security/data risk or blocks safe removal.
4. Preserve working code until the removal plan and dependencies are mapped; do not delete blindly.
5. Audit routes, tables, RPCs, Edge Functions, legacy backend callers and UI dependencies before retirement.
6. Keep ticket payments and ticket finance isolated from those removal decisions.
7. Keep the Wallet suspended product-wide.

---

## 6. Removal decision checkpoint

Before deleting any of Food, Marketplace or Rooms, produce a dependency map covering:
- UI routes/navigation;
- database tables/RLS/RPCs;
- Edge Functions;
- backend APIs;
- VAC/legacy payment callers;
- notifications;
- delivery/order dependencies;
- Admin screens;
- historical records and audit retention;
- any EYA-owned subscription/verification fees that may remain useful independently.

Removal should preserve historical financial/audit records where required rather than dropping data blindly.

---

## 7. Ticket isolation invariant

The decision to simplify/remove Food, Marketplace or Rooms must **not** cause accidental changes to the proven ticket purchase flow.

Preserve:
- Airtel Money;
- TNM Mpamba;
- Bank Transfer;
- Card;
- server-authoritative ticket pricing/reservation;
- VAC Payments verification;
- signed callback fulfilment;
- ticket issuance after verified payment only;
- event finance controls;
- organizer settlement blockers/reserves;
- live rotating admission credential model.

Tickets remain a separately governed financial product under Ticket Management.
