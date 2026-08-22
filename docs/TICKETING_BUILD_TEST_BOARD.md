# EYA Ticketing Build & Test Board

This file is the single checkpoint for ticketing work while development continues between phone tests.

## READY TO TEST ON PHONE

### 1. App startup
Status: NEEDS RETEST

Latest startup protection:
- `/redirect` has a 7-second watchdog.
- Normal users fall back to the User workspace if startup role resolution stalls.
- Temporary organizer identities fail closed: they must resolve into Organizer Workspace or are signed out.

Steps:
1. Pull latest `feat/hybrid-checkout`.
2. Start Expo with a clean cache.
3. Fully close Expo Go, reopen, and scan the new QR.
4. Confirm EYA gets past the launch/loading screen.

Expected:
- No indefinite loading screen.
- Existing customer/student account opens normally.
- Admin workspace remains reachable.

Known log:
- Android Metro bundling completed successfully (`expo-router/entry.js`, 3860 modules).
- SafeAreaView deprecation is only a warning.

If it fails:
- capture the final 20 Metro/PowerShell lines;
- note whether the screen says `Starting EYA...`, shows the EYA logo + pink spinner, or shows another loader;
- capture any red Expo error screen.

### 2. Customer ticket discovery authority
Status: READY AFTER STARTUP

Visit:
- Customer -> Tickets

Expected:
- Only server-published events appear.
- No hard-coded/demo event fallback.
- No legacy ticket-discovery backend fallback.
- No public `Host event` button.
- Purchased tickets remain separate in My Tickets/wallet.

### 3. Admin creates a one-time temporary organizer invitation
Status: READY AFTER STARTUP

Visit:
- Admin -> Event Reviews -> Temporary organizer access
- Direct route: `/admin/organizer-access`

Use a test email that is NOT already registered as an EYA account.

Steps:
1. Enter organizer email.
2. Enter organization/promoter name.
3. Enter Organizer Workspace expiry in Malawi time: `YYYY-MM-DD HH:mm`.
4. Leave invite validity at the provisional editable default of 72 hours or choose another value (1-168 hours).
5. Create invitation.
6. Confirm EYA shows the one-time `EYA-ORG-INV-1-...` secret only on the newly-created invitation card.
7. Share it to the organizer test device/account.

Expected:
- Existing EYA customer email is rejected for this flow.
- Invitation history shows Waiting/Pending.
- Raw invitation token is not recoverable from history after the one-time card is dismissed.
- Admin can revoke an unused invitation.

### 4. Claim the temporary Organizer login
Status: READY AFTER STARTUP + INVITE

Preferred production-style path:
- open `eya://organizer-invite?t=...`.

Expo Go/manual fallback during development:
- open `/organizer-invite` and paste the one-time invitation code.

Steps:
1. Check invitation.
2. Confirm organization, organizer email, invite expiry, and workspace expiry.
3. Enter organizer full name.
4. Create password with at least 10 characters.
5. Activate Organizer Workspace.

Expected:
- A separate temporary organizer auth identity is created.
- Account is marked server-side through trusted `app_metadata` as `temporary_organizer`.
- Invitation becomes Claimed and cannot be reused.
- Organizer is signed into `/(organizer)/dashboard`.
- Organizer does NOT enter normal customer Roles & Workspaces.

### 5. Organizer route isolation
Status: READY AFTER CLAIM

Test:
1. From temporary organizer login, attempt to navigate to a normal student/customer route.
2. Close/reopen EYA while the organizer session is active.
3. Sign out, then use `/organizer-login` with the organizer email/password.

Expected:
- StudentGuard redirects the temporary organizer back to `/(organizer)/dashboard`.
- App startup routes temporary organizers only to Organizer Workspace.
- Dedicated Organizer Login accepts the temporary organizer identity.
- A normal customer account is rejected by Organizer Login.

### 6. Organizer Event Studio
Status: READY AFTER CLAIM

Visit:
- `/(organizer)/dashboard`

Steps:
1. Confirm organization name and workspace expiry are visible.
2. Create an event with future date/time, venue, city, card image, hero image, ticket name, price, and capacity.
3. Save private draft.
4. Submit to EYA Admin.

Expected:
- Draft remains private.
- Submission becomes `pending_review`.
- Event is NOT visible in customer Tickets before Admin approval.
- Server rejects all create/edit/tier/submit operations if the grant is not active.

### 7. Admin event review
Status: READY AFTER SUBMISSION

Visit:
- `/admin/event-reviews`

Request Changes test:
1. Add an Admin review note.
2. Request changes.
3. Organizer opens the event again.
4. Confirm note is shown.
5. Edit and resubmit.

Approve test:
1. Admin approves pending event while organizer access is active.
2. Refresh Customer -> Tickets.

Expected:
- Only Admin approval changes organizer-owned event to `published`.
- Published event becomes customer-visible.

### 8. Immediate organizer revocation + Auth ban
Status: READY AFTER CLAIM

Admin:
1. Open Temporary organizer access.
2. Revoke the active organizer access.

Organizer:
1. Try to use Event Studio while current session is still open.
2. Sign out/reopen and try `/organizer-login` with the same email/password.
3. If an event is pending review, Admin attempts Approve.

Expected:
- Event RPCs reject immediately after revoke.
- Organizer is routed to `Organizer access is not active`.
- Temporary organizer Supabase Auth identity is banned.
- Organizer Login no longer works while revoked.
- Pending event cannot be approved while organizer access is revoked.

### 9. Re-enable revoked organizer
Status: READY AFTER REVOCATION

Admin:
1. On the revoked claimed-access row enter a future `Re-enable until` date.
2. Tap Re-enable.

Organizer:
1. Sign in through `/organizer-login` using the SAME organizer email/password.

Expected:
- Old revoked grant remains in history.
- EYA creates a new active grant row.
- Auth ban is cleared.
- Same temporary organizer identity can sign in again.
- Organizer regains access to the same organizer-owned event history.

### 10. Natural expiry
Status: READY LATER WITH SHORT TEST WINDOW

Use a deliberately short test access window only when we are ready to wait for expiry.

Expected after expiry:
- active grant becomes `expired` on the next server access check;
- organizer RPCs reject;
- temporary organizer identity is Auth-banned on that check;
- Admin can renew an expired non-revoked grant and unban the identity.

### 11. Ticket transfer Phase 1
Status: READY AFTER STARTUP

Visit:
- My Tickets -> Transfers

Expected:
- sender remains owner while pending;
- acceptance changes ownership;
- sender live credential is invalidated;
- recipient can mint a new live credential.

### 12. Guest/offline ticket Phase 2
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
- Temporary organizer grant rollback test passed: ungranted user blocked; active grant allowed work; revoke blocked approval; rollback left no data.
- One-time organizer invite rollback test passed: create -> inspect -> revoke -> replay rejected; rollback left no invite.
- Non-Admin organizer-invite creation test passed: signed-in non-Admin was rejected.
- Invite claim/inspection RPCs are service-role-only.
- Internal Auth ban helper is not executable by anon/authenticated clients.
- Anonymous users cannot execute organizer Admin RPCs.
- Organizer access grant helper now also requires trusted `temporary_organizer` auth metadata.
- Legacy `admin_grant_ticket_organizer_access` authenticated path is disabled; ordinary EYA accounts cannot be converted into organizers through the old RPC.
- Admin revoke immediately Auth-bans temporary organizer identity.
- Expiry Auth-bans the identity on the next access check.
- Renewal/re-enable clears the Auth ban.
- Revoked organizer re-enable creates a fresh grant while retaining old grant history.

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
Backend supports multiple tiers; organizer UI currently starts with one primary tier.

Need to decide UX for:
- General / VIP / Early Bird / Group / Phase tiers;
- tier sale start/end;
- max tickets per order;
- optional access-code/private tiers.

### D. Organizer access grace period
Current system deliberately lets Admin choose the exact expiry.

Need to decide later whether EYA should suggest a default such as:
- event end + 14 days;
- event end + 30 days;
- another settlement/refund/support window.

### E. Global leaked-password protection
Supabase Auth leaked-password protection is currently disabled.

This would improve password security for the whole EYA app, not just organizers, so it should be a deliberate product/security decision before enabling globally.
Reference: https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection

### F. Exact scheduled organizer account expiry
Current security is sufficient for access control because every organizer operation checks the database grant. Auth is banned immediately on revoke and on the first access check after natural expiry.

`pg_cron` is available but not currently installed. Decide later whether we want a background scheduled job that flips expired temporary organizer Auth accounts to banned even when they never reconnect.

### G. Offline-capable secure mobile customer ticket
Important before large events with congested Airtel/TNM networks.

Need a design that remains scannable with poor attendee internet while still resisting stale screenshots/replay.

## KNOWN BROADER SECURITY BACKLOG

Supabase security advisor still reports older non-ticket public tables without RLS and older functions with mutable search paths / broad SECURITY DEFINER exposure. Do not blindly toggle these in a ticketing pass; audit each existing feature and its policies first to avoid breaking production flows.

`ticket_organizer_invites` intentionally has RLS with no client policies because all direct `anon`/`authenticated` table privileges are revoked and only service role accesses it directly.

## BUILD RULES DURING CHARGING / NO-PHONE PERIOD

1. Keep building server/data/client pieces that can be statically inspected or rollback-tested.
2. Do not declare a mobile feature passed until tested on the phone.
3. Add every new phone-dependent checkpoint here.
4. Bring meaningful product/security decisions to the user before locking them in.
5. Avoid unrelated VAC/payment changes while ticketing work continues.
