# EYA Ticketing Build & Test Board

This file is the single checkpoint for ticketing work while development continues between phone tests.

## READY TO TEST ON PHONE

### 1. App startup after organizer/admin hardening
Status: BLOCKED / NEEDS RETEST

Steps:
1. Pull latest `feat/hybrid-checkout`.
2. Start Expo with a clean cache.
3. Fully close Expo Go, reopen, and scan the new QR.
4. Confirm EYA gets past the launch/loading screen.

Expected:
- EYA opens normally.
- No infinite loading screen.
- Existing student/customer and Admin workspaces still open.

If it fails:
- Capture the last 20 terminal lines from Metro/PowerShell.
- Capture any red Expo error screen.
- Do not continue feature testing until startup is stable.

### 2. Customer ticket discovery authority
Status: READY AFTER STARTUP

Visit:
- Student / Customer -> Tickets

Expected:
- Only server-published ticket events appear.
- No old hard-coded/demo event should appear because of a network/load fallback.
- If the authoritative event source fails, the marketplace should show no discoverable events rather than stale/demo inventory.
- Purchased tickets remain separate in My Tickets / wallet.

### 3. Organizer Event Studio
Status: READY AFTER STARTUP

Visit:
- Student / Customer -> Tickets -> Host event

Test:
1. Open Event Studio.
2. Create an event with future date/time, venue, city, card image, hero image, ticket name, price, capacity.
3. Save private draft.
4. Submit to EYA Admin.

Expected:
- Draft is private.
- Submitted event becomes `pending_review`.
- It does NOT appear in the customer ticket marketplace before Admin approval.

### 4. Admin review flow
Status: READY AFTER STARTUP

Visit:
- Admin -> Event Reviews route (`/admin/event-reviews`)

Test A - Request changes:
1. Find organizer submission.
2. Add a review note.
3. Request changes.
4. Return to organizer Event Studio.
5. Open the same event through Fix & resubmit.
6. Confirm Admin note appears.
7. Edit, save, and resubmit.

Test B - Approve:
1. Return to Admin review queue.
2. Approve the resubmitted event.
3. Refresh Student / Customer -> Tickets.

Expected:
- Only Admin approval moves organizer-owned event to `published`.
- Approved event becomes customer-visible.

### 5. Ticket transfer Phase 1
Status: READY AFTER STARTUP

Visit:
- My Tickets -> Transfers

Expected:
- Sender remains owner while transfer is pending.
- Recipient accepts -> ownership moves.
- Sender's previous live credential becomes invalid.
- Recipient can mint a new live credential.

### 6. Guest/offline ticket Phase 2
Status: PRODUCT DIRECTION UNDER REVIEW

Current technical implementation exists, but product direction changed toward app-first claiming rather than browser admission.

Do not treat the current browser live guest page as final product behavior.

## NEEDS PRODUCT DECISION TOGETHER

### A. External ticket recipient flow
Decision needed:
- Recommended direction: smart invite opens EYA if installed; otherwise install/claim page; admission ticket ultimately lives in EYA.
- Decide whether accountless Guest Wallet inside EYA is allowed or whether a full EYA account is mandatory.

### B. Offline / printable tickets
Decision needed:
- Keep as organizer-controlled exceptional fallback, or keep available for every event?
- Recommended: organizer/Admin-configurable fallback with explicit bearer-ticket warning.

### C. Organizer eligibility
Decision needed before wider rollout:
- Can every authenticated user create an organizer draft?
- Or must the user first have a verified Organizer Workspace before Event Studio is enabled?
- Recommended: anyone may begin an organizer application; only verified organizer workspace can submit paid public events.

### D. Ticket tier experience
Backend supports multiple tiers. UI currently starts with a primary tier.

Need decision on default UX:
- General / VIP / Early Bird / Group / Phase tiers
- sale start/end per tier
- max tickets per order
- optional access code / private tier

### E. Offline-capable secure mobile ticket
Important before large events.

Need design decision for how EYA tickets remain scannable when attendee mobile data is poor while preserving anti-screenshot/replay security.

## PASSED / SERVER VERIFIED

- Payment rails already proven: Airtel, TNM/Mpamba, bank details, hosted card.
- Live personal rotating credentials implemented.
- Permanent `EYA-...` reference is not an admission credential.
- Ticket ownership transfer acceptance revokes old live credentials.
- Guest/offline credential entitlement uses one-ticket/one-admission invariant.
- Organizer review state machine rollback test passed.
- Direct legacy rewrite of `pending_review` organizer event was blocked.
- Admin review RPC successfully transitions a valid submission to published.
- Anonymous ticket catalog grants reduced to SELECT only; RLS remains authoritative.

## BUILD RULES DURING CHARGING / NO-PHONE PERIOD

1. Keep building server/data/client pieces that can be statically inspected or rollback-tested.
2. Do not declare a mobile feature passed until it is tested on the phone.
3. Add every new phone-dependent checkpoint to this file.
4. Bring product/security decisions to the user before locking in behavior.
5. Avoid unrelated VAC/payment changes while ticketing work continues.
