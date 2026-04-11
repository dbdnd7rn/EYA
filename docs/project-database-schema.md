# Project Database Schema

This project uses two logical database areas:

- `public`: core Pa-Level housing, chat, profiles, wallet, admin content, support, trust/safety
- `campus_market`: marketplace, food ordering, deliveries, vendor operations

## SQL Files To Run

Run these files in Supabase SQL Editor in this order:

1. `supabase/sql/20260331_public_housing_schema.sql`
2. `supabase/sql/20260303_profiles_role_agent.sql`
3. `supabase/sql/20260303_wallet_sync.sql`
4. `supabase/sql/20260303_pricing_content.sql`
5. `supabase/sql/20260330_ops_foundation.sql`
6. `supabase/sql/20260303_campus_market_schema.sql`
7. `supabase/sql/20260402_order_handoffs.sql`

## Main Modules

### `public`

- `profiles`
  Stores app users and roles: `student`, `landlord`, `agent`, `admin`.
- `listings`
  Hostel and bedsitter listings created by landlords.
- `enquiries`
  Student-to-landlord listing conversations.
- `messages`
  Chat messages within an enquiry, supports text and image messages.
- `reviews`
  Student reviews for listings.
- `saved_rooms`
  Student saved listings.
- `listing_reports`
  Listing abuse and scam reports.
- `landlord_verifications`
  Verification workflow for landlords.
- `landlord_public_verification`
  Public view exposing whether a landlord is currently verified.
- `support_tickets`
  General support requests and listing reports from the support page.
- `wallet_accounts`, `wallet_activities`
  Student wallet balance and activity.
- `pricing_plans`, `pricing_testimonials`, `pricing_case_studies`, `pricing_faqs`
  CMS-like pricing page content.
- `app_runtime_events`, `push_notification_tokens`, `trust_safety_reports`
  Ops, notifications, and moderation data.

### `campus_market`

- `profiles`
  Separate profile context for marketplace/food users.
- `vendors`
  Vendor or restaurant storefronts.
- `catalog_items`
  Products and food items.
- `orders`
  Customer orders.
- `order_items`
  Order line items.
- `deliveries`
  Driver assignment and delivery progress.
- `order_handoffs`
  Delivery invoice reference, customer PIN, QR token, and verification audit for final handoff.
- `driver_locations`
  Realtime rider coordinates.
- `trust_scores`
  Vendor/driver/customer quality metrics.

## Relationship Summary

- One `profiles` row belongs to one `auth.users` row.
- One landlord can own many `listings`.
- One listing can have many `enquiries`, `reviews`, `saved_rooms`, and `listing_reports`.
- One enquiry can have many `messages`.
- One student can save many rooms and write many reviews, but only one review per listing.
- One landlord can create many `landlord_verifications`; the latest row determines public verification state.
- One vendor can own many `catalog_items` and receive many `orders`.
- One order can have many `order_items`, at most one `delivery`, and at most one `order_handoff`.

## Notes

- The new housing schema file was inferred from actual app queries in the codebase, then aligned with the existing SQL files already present in `supabase/sql`.
- `campus_market` is intentionally isolated so marketplace and food features do not collide with existing `public` tables.
