# EYA Ticketing Build & Test Board

This file is the single checkpoint for ticketing work while development continues between phone tests.

## READY TO TEST ON PHONE

### 1. App startup + one-account landing
Status: NEEDS RETEST

Latest startup protection:
- `/redirect` has a 7-second watchdog.
- Normal users fall back to the Personal/User workspace if startup role resolution stalls.
- A fresh sign-in lands in Personal/User before the person chooses a specialized workspace.
- Specialized workspace permissions add tools; they do not replace the person's normal EYA identity.

Steps:
1. Pull latest `feat/hybrid-checkout`.
2. Start Expo with a clean cache.
3. Fully close Expo Go, reopen, and scan the new QR.
4. Sign in with a normal EYA account.
5. Confirm EYA gets past the launch/loading screen and lands in Personal/User.

Expected:
- No indefinite loading screen.
- Existing User account opens normally.
- Existing Food Provider/Landlord/Delivery/Admin accounts can still enter Personal/User.
- Admin workspace remains reachable only for Admin.

Known log:
- SafeAreaView deprecation is only a warning.

If it fails:
- capture the final 20 Metro/PowerShell lines;
- note whether the screen says `Starting EYA...`, shows the EYA logo + pink spinner, or shows another loader;
- capture any red Expo error screen.

### 2. Customer ticket discovery authority
Status: READY AFTER STARTUP

Visit:
- User -> Tickets

Expected:
- Only server-published events appear.
- No hard-coded/demo event fallback.
- No legacy ticket-discovery backend fallback.
- No public `Host event` button.
- Purchased tickets remain separate in My Tickets/wallet.

### 3. Personal/User access survives specialized workspaces
Status: READY AFTER STARTUP

Test with at least one existing Food Provider, Landlord, Delivery Agent and Admin account.

For each account:
1. Sign in normally.
2. Open Personal/User.
3. Browse Rooms.
4. Open a room.
5. Send an enquiry/message where safe.
6. Open normal Marketplace/Food/Tickets/customer screens.
7. Reach normal checkout where applicable.

Expected:
- No `You must be a student` route-level rejection merely because the account also has a specialized workspace.
- Specialized account status does not remove normal Personal/User features.
- Room enquiry/message participation remains based on the signed-in user identity.

Known legacy cleanup still required:
- Room Details still has explicit `student` checks for Save Room and Write Review.

### 4. Account -> Workspaces
Status: READY AFTER STARTUP

Visit:
- Account -> Workspaces

Expected for every account:
- `Personal / User` always appears.
- only verified/approved specialized workspaces appear;
- unapproved management workspaces are hidden;
- `Apply for another workspace` opens Landlord / Food Provider / Delivery applications rather than pretending the user already owns those workspaces.

Expected specialized visibility:
- Food Provider only when approved/grandfathered;
- Landlord only when approved/grandfathered;
- Delivery Agent only when approved/grandfathered;
- Admin only for Admin;
- Ticket Management only after EYA Admin grants active organizer access.

Security test:
- manually open a specialized route the user does not own.

Expected:
- specialized guard rejects/redirects;
- hiding the Workspaces card is not the only security control.

### 5. Admin grants Ticket Management to a normal EYA account
Status: READY AFTER STARTUP

Visit:
- Admin -> Event Reviews -> Ticket Management access
- Direct route: `/admin/organizer-access`

Prerequisite:
- organizer must already have a normal EYA account.

Steps:
1. Enter the organizer's existing EYA account email.
2. Enter Promoter / Organization name.
3. Enter access expiry in Malawi time: `YYYY-MM-DD HH:mm`.
4. Add optional verification/admin context note.
5. Tap `Grant Ticket Management`.

Expected:
- an unknown/non-EYA email is rejected with instruction to create/sign in to a normal EYA account first;
- no second password/account is created;
- no one-time organizer secret is generated;
- stable Promoter / Organization ownership is created/reused;
- Ticket Management access row is active;
- the person's normal EYA account remains unchanged as their login identity.

Current first-version constraint:
- one active Ticket Management promoter organization per user at a time.
- multi-promoter membership/switching is not yet a decided product feature.

### 6. Ticket Management appears on the same account
Status: READY AFTER ADMIN GRANT

Organizer user:
1. Sign in normally.
2. Confirm fresh login lands in Personal/User.
3. Open Account -> Workspaces.
4. Confirm `Ticket Management` appears with the Promoter / Organization name/context.
5. Open Ticket Management.

Expected:
- same EYA login is used;
- no `/organizer-login` is required;
- OrganizerGuard accepts the normal account only when the active grant exists;
- direct `/(organizer)/dashboard` access without a grant is rejected back to Workspaces;
- organizer can leave the organizer tools and continue using normal EYA features.

### 7. Organizer Event Studio
Status: READY AFTER TICKET MANAGEMENT GRANT

Visit:
- Account -> Workspaces -> Ticket Management
- route: `/(organizer)/dashboard`

Steps:
1. Confirm organization name and access expiry are visible where applicable.
2. Create an event with future date/time, venue, city, card image, hero image, ticket name, price, and capacity.
3. Save private draft.
4. Submit to EYA Admin.

Expected:
- Create/save does NOT publish anything.
- Draft remains private.
- Event inherits the stable Promoter / Organization ID from the active Ticket Management grant.
- Human EYA account remains actor/creator for audit.
- Submission becomes `pending_review`.
- Event is NOT visible or purchasable in User Tickets before Admin approval.
- Server rejects all create/edit/tier/submit operations if Ticket Management access is not active.

### 8. Admin approves the EVENT + TICKETS together
Status: READY AFTER SUBMISSION

Visit:
- `/admin/event-reviews`

Admin must review both event details and each submitted ticket type.

Confirm the review card shows:
- event title/category/date;
- venue/city/description;
- organizer/promoter identity;
- each ticket name and description;
- price;
- capacity;
- sold/reserved counts;
- available/disabled state;
- ticket sale start/end window.

Request Changes test:
1. Add an Admin review note.
2. Request changes.
3. Organizer opens the event again.
4. Confirm note is shown.
5. Edit and resubmit.

Approve Event + Tickets test:
1. Admin taps `Approve Event + Tickets` while Ticket Management access is active.
2. Confirm the dialog explains that event details and ticket price/capacity/availability/sale windows are being locked into an EYA approval version.
3. Approve + Publish.
4. Refresh User -> Tickets.

Expected:
- Only Admin approval changes organizer-owned event to `published`.
- Approval creates an immutable approval-version snapshot and SHA-256 integrity hash.
- The approved event becomes customer-visible only after approval.
- The payment reservation gate accepts only organizer events whose current event + ticket terms still match the approved version.

### 9. Revoke Ticket Management without breaking the EYA account
Status: READY AFTER GRANT

Admin:
1. Open Ticket Management access.
2. Revoke the active organizer access.

Organizer user:
1. Keep the current EYA session open.
2. Try to reopen Ticket Management/Event Studio.
3. Open Account -> Workspaces.
4. Open normal Rooms, Messages, Marketplace, Tickets and Account.
5. Fully sign out and sign back in with the same normal EYA credentials.

Expected:
- organizer/event RPCs reject immediately after revoke;
- Ticket Management disappears from Workspaces;
- direct organizer route is rejected;
- the normal EYA auth account is NOT banned;
- the user is NOT forced to create another account;
- Personal/User remains fully available;
- purchased tickets/orders/messages remain attached to the same account;
- pending organizer event cannot be approved while organizer access is revoked if that rule still applies to the review boundary.

### 10. Re-enable revoked Ticket Management
Status: READY AFTER REVOCATION

Admin:
1. On the revoked access row enter a future `Re-enable until` date.
2. Tap Re-enable.

Organizer user:
1. Stay signed in or sign in normally with the SAME EYA account.
2. Open Account -> Workspaces.

Expected:
- old revoked grant remains in history;
- EYA creates a new active grant row;
- same stable Promoter / Organization is preserved;
- Ticket Management reappears;
- organizer regains access to the same organizer-owned event history even though the new grant has a different grant ID;
- no auth-ban clearing is needed for a normal account because the account was never banned.

### 11. Natural Ticket Management expiry
Status: READY LATER WITH SHORT TEST WINDOW

Use a deliberately short test access window only when we are ready to wait for expiry.

Expected after expiry:
- organizer RPCs reject because `expires_at` is no longer valid;
- Ticket Management no longer resolves as active;
- normal EYA account remains usable;
- Personal/User remains available;
- Admin can renew/re-enable access without changing the user's login identity;
- finance entitlement behavior after operations expiry is NOT final yet and must be tested only after the separate settlement-access model is built.

### 12. Published event revision workflow
Status: READY AFTER ONE ORGANIZER EVENT IS PUBLISHED

Organizer visit:
- Ticket Management -> Published event -> `Propose changes`

Product language target:
- `Current live event`
- `Proposed changes`
- avoid primary user-facing V1/V2 jargon.

Test:
1. Note the current live venue and ticket price.
2. Tap `Propose changes`.
3. Change a material event field such as venue.
4. Change a ticket price, capacity, sale window, or availability.
5. Add another ticket type if useful.
6. Save proposed changes.
7. Submit proposed changes to EYA Admin.
8. BEFORE Admin approval, open the event from a normal User account.

Critical expected result before approval:
- customer still sees current approved venue/details;
- customer still sees current approved ticket price/capacity/availability;
- checkout/reservation still uses current approved terms;
- organizer dashboard shows proposed changes are under review.

Admin visit:
- Admin -> Event Reviews -> Live event revisions
- Direct route: `/admin/event-revisions`

Expected after approval:
- proposed changes atomically replace the prior live configuration;
- approval version increments internally;
- customer now sees the newly approved event/ticket terms;
- payment reservation uses new terms only after approval succeeds;
- old approval remains in immutable approval history;
- direct live price/venue mutation outside the revision workflow remains blocked.

### 13. Organizer Early Payout / Event Advance
Status: READY AFTER A REAL TEST ORGANIZER EVENT IS APPROVED AND HAS PAID TEST SALES

IMPORTANT:
- this phase tests EYA accounting, reserve protection, requests and Admin approval only;
- actual PayChangu payout API execution is NOT connected yet;
- do not send real organizer money during this test.

Admin first:
- Admin -> Event Reviews -> Event finance & payouts
- Direct route: `/admin/event-payouts`

Steps:
1. Open the approved organizer event.
2. Set a protected refund reserve.
3. Set the EYA/platform fee amount for the test.
4. Set any other manual hold if needed.
5. Tap `Save & Open`.

Organizer:
- Ticket Management -> approved event -> `Finance & payouts`
- Direct route: `/(organizer)/event-finance?eventId=...`

Expected before request:
- event ticket sales are shown from paid ticket orders;
- refunded amount is shown separately;
- protected refund reserve is visible;
- EYA/platform fee is visible;
- other hold is visible;
- paid-to-organizer is visible;
- only the server-calculated `Available now` amount can be requested;
- if Admin has not configured finance controls, available payout remains unavailable/zero.

Early Payout test:
1. Request an amount lower than or equal to `Available now`.
2. Confirm wording says `Early Payout` / advance, not withdrawal/final settlement.
3. Admin opens `/admin/event-payouts`.
4. Confirm Admin sees requested amount, current eligible amount, reserve and previously-paid amount.
5. Approve LESS than the organizer requested.
6. Refresh Organizer Finance.

Expected:
- approved amount is reserved immediately and cannot be requested again;
- organizer history shows `Approved · awaiting payout`;
- remaining available amount is reduced by the approved amount;
- one event cannot have a second pending/approved payout request at the same time;
- no PayChangu money moves yet.

Known blocker:
- current availability still needs a real PayChangu settled/available-funds authority before real organizer payout execution.

Freeze test:
1. Admin taps `Freeze` for the event finance account.
2. Organizer refreshes Finance & payouts.

Expected:
- new payout requests are blocked while frozen;
- existing financial/audit history remains.

### 14. Refund impact on an Early Payout
Status: SERVER VERIFIED; PHONE TEST LATER WHEN REAL REFUND FLOW EXISTS

Expected accounting behavior:
- a refunded ticket/order reduces active paid event funds;
- protected reserve and holds still remain protected;
- future payout eligibility falls automatically;
- if refunds make prior organizer advances exceed currently supportable event funds, EYA shows `Organizer advance liability` / `Settlement hold`;
- further payouts become zero/blocked until the liability is resolved.

Do not simulate a real customer refund manually on production just to test this screen. Wait for the proper ticket refund workflow/provider integration.

### 15. Final Settlement
Status: READY LATER AFTER A SAFE TEST EVENT HAS ENDED

Organizer Finance & payouts switches from Early Payout to Final Settlement after the event has finished.

Before final settlement:
1. Admin reconciles refunds/disputes.
2. Admin keeps any required reserve/hold in place while reconciliation is incomplete.
3. Confirm Organizer cannot request final settlement while reserve or hold remains.
4. Admin clears protected refund reserve to `0` only when safe.
5. Admin clears other hold to `0` only when safe.

Organizer:
1. Open `Finance & payouts`.
2. Confirm `Final settlement` is ready.
3. Request Final Settlement.

Admin:
1. Review the final-settlement request.
2. Admin may approve the full amount or less.
3. If less is approved, remaining eligible balance stays open for another final-settlement request later.

Expected:
- final settlement is unavailable before event completion;
- final settlement is unavailable while refund reserve/hold remains;
- it is unavailable when an organizer advance liability exists;
- only the remaining eligible event balance can be settled;
- finance status becomes `settled` only after the final payout is recorded paid and eligible balance reaches zero;
- Admin cannot manually set `settled` from the finance-control screen.

IMPORTANT:
- actual PayChangu payout execution is still NOT wired;
- operations expiry vs finance/settlement access is still a separate architecture blocker and must be resolved before production settlement flow.

### 16. Ticket transfer Phase 1
Status: READY AFTER STARTUP

Visit:
- My Tickets -> Transfers

Expected:
- sender remains owner while pending;
- acceptance changes ownership;
- sender live credential is invalidated;
- recipient can mint a new live credential.

### 17. Guest/offline ticket Phase 2
Status: PRODUCT DIRECTION UNDER REVIEW

Current technical implementation exists, but browser live guest admission is not the intended final product direction. External ticket sharing should move toward app-first claim/install behavior.

## PASSED / SERVER VERIFIED

- Airtel, TNM/Mpamba, bank, and hosted card payment rails already proven.
- Personal rotating admission credentials implemented.
- Permanent `EYA-...` ticket reference is not an admission credential.
- Ticket transfer acceptance revokes prior live credential.
- One-ticket/one-admission entitlement invariant preserved across guest/offline modes.
- Organizer review state-machine rollback test passed.
- Legacy direct rewrite of pending organizer submission was blocked.
- Customer discovery is Admin-published-server authoritative.
- Public `Host event` exposure removed.
- One-account Personal/User route foundation implemented with `UserGuard`; specialized workspace status no longer automatically ejects Food Provider/Landlord/Delivery/Admin users from the normal User route tree.
- Normal-account Ticket Management grant/revoke rollback test passed:
  - EYA Admin granted Ticket Management to an existing normal EYA account;
  - the normal account resolved an active organizer grant;
  - revoke removed organizer access;
  - the user's auth `banned_until` state remained unchanged;
  - transaction rolled back cleanly.
- Normal-account Event Studio rollback test passed:
  - Admin granted Ticket Management to a normal EYA account;
  - the same account created an organizer event draft through the real RPC;
  - event stored the same normal user as actor/organizer and the stable Promoter / Organization as `organization_id`;
  - transaction rolled back cleanly.
- `current_ticket_organizer_grant` and `current_ticket_organizer_organization` no longer require the retired `temporary_organizer` marker.
- Legacy creation/claim of separate temporary organizer identities is disabled for new access.
- Compatibility auth-ban logic only targets identities actually marked as legacy `temporary_organizer`; it does not ban normal EYA accounts.
- Anonymous users cannot execute organizer Admin RPCs.
- Admin grant requires a real existing EYA auth account email.
- Admin event + ticket approval integrity rollback test passed:
  - Admin approval created an approval version/hash;
  - approved ticket price mutation was blocked;
  - approved venue mutation was blocked;
  - reservation counters remained operational;
  - approved checkout reservation succeeded;
  - transaction rolled back with no fake event/order/approval left behind.
- Existing production catalog remains compatible: current published catalog events are Admin-created events with no organizer attached.
- Internal approval/hash/trigger helpers are not executable by anon/authenticated clients.
- Published-event live revision rollback test passed:
  - current live config remained unchanged while proposed changes were pending;
  - Admin approval atomically applied the proposed config;
  - approval version advanced;
  - new approval hash matched the applied live event + tiers;
  - direct post-approval ticket mutation remained blocked;
  - transaction rolled back cleanly.
- Revision tables have no direct anon/authenticated SELECT/INSERT/UPDATE access.
- Anonymous users cannot execute revision RPCs.
- Internal revision-apply context helper is service-only.
- Signed-in non-Admin was explicitly blocked from Admin revision list/review RPCs.
- Revision material-trigger execution was tested under the real `authenticated` database role: an Admin can still pause a published organizer event without gaining any material-change bypass, and the rollback left no rows behind.
- Production cleanup audit passed after revision rollback tests: zero revision rows, zero revision-tier/log/apply-context rows, zero test approval versions, zero rollback-named events; the existing 5 published Admin-created catalog events remain unchanged.
- Early Payout + refund-liability rollback test passed:
  - MWK 10,000 paid event sales;
  - MWK 3,000 protected reserve + MWK 500 platform fee + MWK 500 other hold;
  - MWK 6,000 eligible before payout;
  - organizer requested MWK 4,000;
  - Admin approved MWK 3,000;
  - after payout, only MWK 3,000 remained eligible;
  - when the order was marked refunded, availability fell to zero and organizer advance liability became MWK 3,000;
  - further payout request was blocked;
  - transaction rolled back cleanly.
- Final Settlement rollback test passed:
  - final settlement was blocked while refund reserve remained;
  - after Admin cleared reserve/hold, MWK 9,500 was eligible;
  - partial MWK 9,000 settlement left MWK 500 open;
  - second MWK 500 settlement completed the event finance account;
  - finance status auto-changed to `settled` only when balance reached zero;
  - transaction rolled back cleanly.
- Approved-only payout boundary rollback test passed:
  - a fake organizer event without a real EYA approval version could not receive finance controls or request money;
  - a normal organizer event submitted and approved through Admin review could configure finance and request Early Payout successfully;
  - transaction rolled back cleanly.
- Finance tables have no direct anon/authenticated SELECT/INSERT/UPDATE access.
- Anonymous users cannot execute finance RPCs.
- Internal finance snapshot helper is service-role-only.
- Signed-in non-Admin was explicitly blocked from Admin finance-list RPCs.
- Finance cleanup audit passed: zero finance-control rows, zero finance logs, zero payout requests and zero rollback finance events remain; the existing published Admin-created catalog remains unchanged.

## NEEDS PRODUCT DECISION TOGETHER

### A. External customer ticket recipient flow
Recommended direction:
- smart invite opens EYA if installed;
- otherwise install/claim handoff;
- admission credential ultimately lives inside EYA.

Decision still needed:
- accountless Guest Wallet inside EYA vs mandatory full EYA account.

### B. Offline / printable customer tickets
Decision still needed:
- organizer-controlled exceptional fallback, or available to every event?

Recommended:
- organizer/Admin-configurable exceptional bearer fallback with clear first-scan-wins warning.

### C. Ticket tier experience
Backend and live revision editor support multiple tiers.

Need later polish/decision for:
- default templates such as General / VIP / Early Bird / Group / Phase tiers;
- max tickets per order;
- optional access-code/private tiers.

### D. Published-event revision workflow
RESOLVED.

Rule:
- the currently approved public version stays live and purchasable while separate proposed changes wait for Admin review;
- saving/submitting proposed changes never changes customer-visible or checkout terms;
- only Admin approval atomically applies them and creates the next immutable approval version;
- organizer/Admin may separately pause the live event when needed.

### E. Organizer payout execution + refund integration
Early Payout and Final Settlement accounting/request/approval are implemented, but actual money execution is deliberately not connected yet.

Need to decide/verify before real payouts:
- exact PayChangu payout API flow for Airtel Money, TNM Mpamba and bank;
- where promoter payout destination/KYC details are stored and how they are verified;
- provider idempotency/reconciliation for payout retries;
- actual ticket refund execution for card and mobile-money rails;
- partial refund model and provider status reconciliation;
- when refund reserve should be released;
- suggested risk-based early-payout/reserve policy for new vs established organizers;
- settled/available PayChangu funds authority separate from customer-paid status.

Current rule:
- no hardcoded reserve percentage;
- Admin explicitly sets reserve/fee/hold;
- approved payout requests reserve funds but do not move PayChangu money yet.

### F. Ticket Management operations expiry vs finance entitlement
Decision direction is clear but implementation is not built.

Need separate lifecycles for:
- operations permission: create/edit/manage events;
- finance/settlement entitlement: statements, refunds, advances, liabilities, final settlement.

Finance entitlement should be able to survive operations expiry until the promoter's financial relationship is closed.

### G. Multi-promoter membership
Current first version allows one active Ticket Management promoter organization per user at a time.

Need later decision:
- can one EYA account manage multiple promoter organizations simultaneously?
- if yes, how does the person select the active organization inside Ticket Management?

Do not silently remove the current one-active-organization constraint without deciding this UX/permission model.

### H. Global leaked-password protection
Supabase Auth leaked-password protection is currently disabled.

This would improve password security for the whole EYA app, so it should be a deliberate product/security decision before enabling globally.

### I. Offline-capable secure mobile customer ticket
Important before large events with congested Airtel/TNM networks.

Need a design that remains scannable with poor attendee internet while still resisting stale screenshots/replay.

## KNOWN BROADER SECURITY BACKLOG

Supabase security advisor still reports older non-ticket public tables without RLS and older functions with mutable search paths / broad SECURITY DEFINER exposure. Do not blindly toggle these in a ticketing pass; audit each existing feature and its policies first to avoid breaking production flows.

Legacy `ticket_organizer_invites` remains a direct-revoked/internal table for compatibility, but creation/claim of the retired temporary organizer flow is disabled for new access.
Live revision tables and event-finance tables intentionally have RLS with no client policies because all direct `anon`/`authenticated` table privileges are revoked and access is through validated RPCs only.

## BUILD RULES DURING CHARGING / NO-PHONE PERIOD

1. Keep building server/data/client pieces that can be statically inspected or rollback-tested.
2. Do not declare a mobile feature passed until it is tested on the phone.
3. Add every new phone-dependent checkpoint here.
4. Bring meaningful product/security decisions to the user before locking them in.
5. Avoid unrelated VAC/payment changes while ticketing work continues.
