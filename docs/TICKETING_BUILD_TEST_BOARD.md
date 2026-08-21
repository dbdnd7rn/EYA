# EYA Ticketing Build & Test Board

This file is the single checkpoint for ticketing work while development continues between phone tests.

## READY TO TEST ON PHONE

### 1. App startup after organizer/admin hardening
Status: NEEDS RETEST AFTER STARTUP WATCHDOG FIX

Latest startup reliability fix:
- `ad0f5d2` - prevent indefinite `/redirect` loading.
- If workspace/profile resolution stalls, EYA should route to the normal User workspace within about 7 seconds instead of spinning forever.

Steps:
1. Pull latest `feat/hybrid-checkout`.
2. Start Expo with a clean cache.
3. Fully close Expo Go, reopen, and scan the new QR.
4. Confirm EYA gets past the launch/loading screen.
5. If the saved workspace cannot resolve quickly, wait up to 7 seconds and confirm EYA falls back to the User workspace.

Expected:
- EYA opens normally.
- No indefinite loading screen.
- Existing student/customer workspace opens.
- Admin can still be entered through the normal workspace flow.

Known log:
- Metro successfully bundled the Android app (`expo-router/entry.js`, 3860 modules).
- The current SafeAreaView deprecation message is only a warning and is not the startup blocker.

If it fails:
- Capture the last 20 terminal lines from Metro/PowerShell.
- Capture any red Expo error screen.
- Note whether the visible spinner says `Starting EYA...`, shows only the EYA logo + pink spinner, or is another screen. That identifies the exact startup stage.
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
- There is NO public `Host event` button for normal users.

### 3. Temporary Organizer Workspace access
Status: READY AFTER STARTUP

Admin visit:
- Admin -> Event Reviews -> Temporary organizer access
- Direct route while testing: `/admin/organizer-access`

Test:
1. Use an existing EYA account email for a trusted organizer test account.
2. Enter organization/promoter name.
3. Enter an explicit future access expiry in `YYYY-MM-DD HH:mm` Malawi time.
4. Activate Organizer Workspace.
5. Confirm it appears as Active with the selected expiry.

Expected:
- Only Admin can grant access.
- Normal users cannot self-apply for Organizer access.
- Access has a visible expiry.
- Admin can renew an active/expired grant.
- Admin can revoke access immediately.

### 4. Organizer Event Studio
Status: READY AFTER STARTUP + ACTIVE ADMIN GRANT

Normal-user negative test:
- Navigate directly to `/(student)/organizer-events` without a grant.
- Expected: `Organizer access unavailable`; no create button/form.

Granted-organizer test:
1. Open `/(student)/organizer-events` using the account Admin granted.
2. Confirm organization name and temporary access expiry are shown.
3. Create an event with future date/time, venue, city, card image, hero image, ticket name, price, capacity.
4. Save private draft.
5. Submit to EYA Admin.

Expected:
- Draft is private.
- Submitted event becomes `pending_review`.
- It does NOT appear in the customer ticket marketplace before Admin approval.
- If Admin revokes/expires the grant, Event Studio becomes unavailable and the organizer cannot edit or submit.

### 5. Admin review flow
Status: READY AFTER STARTUP

Visit:
- Admin -> Event Reviews route (`/admin/event-reviews`)

Test A - Request changes:
1. Find organizer submission.
2. Add a review note.
3. Request changes.
4. Return to organizer Event Studio while grant is still active.
5. Open the same event through Fix & resubmit.
6. Confirm Admin note appears.
7. Edit, save, and resubmit.

Test B - Revocation protection:
1. Revoke the organizer grant while the event is pending review.
2. Attempt Approve.

Expected:
- Approval is blocked because organizer access is expired/revoked.

Test C - Approve:
1. Renew/reactivate the same grant if needed.
2. Return to Admin review queue.
3. Approve the resubmitted event.
4. Refresh Student / Customer -> Tickets.

Expected:
- Only Admin approval moves organizer-owned event to `published`.
- Approved event becomes customer-visible.

### 6. Ticket transfer Phase 1
Status: READY AFTER STARTUP

Visit:
- My Tickets -> Transfers

Expected:
- Sender remains owner while transfer is pending.
- Recipient accepts -> ownership moves.
- Sender's previous live credential becomes invalid.
- Recipient can mint a new live credential.

### 7. Guest/offline ticket Phase 2
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
RESOLVED: Option B.

Rules now:
- No public organizer application.
- No Organizer option exposed to normal students/users.
- Organizer access is Admin-invite-only.
- Organizer Workspace access is temporary, explicitly expires, and is remotely revocable.
- Underlying identity/history is retained for audit, refunds, payouts and fraud investigation even after workspace access ends.

Next organizer-auth decision:
- Existing EYA account required before Admin grant, OR
- Admin sends a one-time invite that creates a limited organizer-only login/session.
- Current foundation uses an existing EYA account; decide whether to add the limited temporary-login flow.

### D. Ticket tier experience
Backend supports multiple tiers. UI currently starts with a primary tier.

Need decision on default UX:
- General / VIP / Early Bird / Group / Phase tiers
- sale start/end per tier
- max tickets per order
- optional access code / private tier

### E. Organizer access grace period
Current system does NOT silently choose a duration. Admin explicitly sets the expiry.

Need decision later:
- Should EYA suggest a default expiry such as event end + 14 days, +30 days, or another settlement/support window?
- Admin should still be able to override/extend when needed.

### F. Offline-capable secure mobile ticket
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
- Android Metro bundling completed successfully after organizer/admin changes; current blocker is runtime routing, not compilation.
- Temporary Organizer Workspace rollback test passed:
  - ungranted normal user create blocked;
  - Admin grant allowed organizer draft + submit;
  - Admin revocation blocked later publication;
  - transaction rolled back with no test grant/event left behind.
- Organizer grant user identity FK uses delete-restrict to preserve audit/history.

## BUILD RULES DURING CHARGING / NO-PHONE PERIOD

1. Keep building server/data/client pieces that can be statically inspected or rollback-tested.
2. Do not declare a mobile feature passed until it is tested on the phone.
3. Add every new phone-dependent checkpoint to this file.
4. Bring product/security decisions to the user before locking in behavior.
5. Avoid unrelated VAC/payment changes while ticketing work continues.
