# Ticket Gate Staff v1 — Test Plan

Status: **Git-only / not deployed**

This plan validates the event-scoped Gate Staff model before any production Supabase migration is applied.

## Scope

Gate Staff is a normal EYA account temporarily authorized to scan tickets for one specific event. It does not grant Admin, Ticket Management, finance, payout, event-edit, or cross-event privileges.

Scanner authority must remain server-enforced. Client UI state is never authoritative.

## Migrations under test

1. `20260823024500_ticket_gate_staff_foundation.sql`
2. `20260823025500_event_scope_ticket_gate_checkin.sql`
3. `20260823030500_ticket_gate_checkin_activity.sql`
4. `20260823031500_bind_gate_staff_invites_to_auth_accounts.sql`

## Pre-deploy gate

Do not deploy until all of the following are true:

- Historical local migration replay completes successfully.
- The four Gate Staff migrations apply successfully to the local disposable database.
- Production migration history remains aligned with Git before deployment.
- `supabase db push --dry-run` proposes only the intended new Gate Staff migrations.
- No payment, Wallet, Food, Marketplace, or Rooms migration is included in the proposed push.

## Identity and invitation tests

### GS-ID-01 — Existing verified account required

Expected: organizer can invite an existing EYA Auth account whose email is confirmed.

### GS-ID-02 — Unknown account rejected

Expected: invitation for an email with no Auth account is rejected.

### GS-ID-03 — Unverified Auth account rejected

Expected: invitation is rejected when `auth.users.email_confirmed_at` is null.

### GS-ID-04 — Mutable profile email cannot claim invite

Expected: changing `profiles.email` does not allow another account to accept an invitation. Assignment identity is bound to `auth.users.id`.

### GS-ID-05 — Wrong user cannot accept or decline

Expected: an authenticated user whose Auth ID does not match `assignment.user_id` is rejected.

### GS-ID-06 — Duplicate open assignment rejected

Expected: the same user cannot hold two open `invited`/`accepted` assignments for the same event.

## Organizer authorization tests

### GS-ORG-01 — Correct organizer can invite

Expected: Ticket Management organizer for the event organization can invite Gate Staff.

### GS-ORG-02 — Different organizer rejected

Expected: organizer from another organization cannot invite, list, revoke, or read check-in activity for the event.

### GS-ORG-03 — Normal user rejected

Expected: normal authenticated user cannot call organizer Gate Staff RPCs successfully.

### GS-ORG-04 — Archived/cancelled invite rejected

Expected: new Gate Staff invitation cannot be created for archived or cancelled event state.

## Assignment lifecycle tests

### GS-LIFE-01 — Invitation visible

Expected: assigned Auth account sees the invitation in the Gate Staff workspace.

### GS-LIFE-02 — Accept

Expected: accepted assignment records `accepted_at` and becomes `scheduled` or `active` according to event time/state.

### GS-LIFE-03 — Decline

Expected: declined assignment cannot scan and cannot later be accepted.

### GS-LIFE-04 — Revoke

Expected: organizer revocation immediately prevents further scans, including from an already-open scanner screen.

### GS-LIFE-05 — Event cancellation

Expected: cancelled event disables scanning even when assignment row is still `accepted`.

### GS-LIFE-06 — Automatic expiry

Expected: scanner stops authorizing after `coalesce(ends_at, starts_at + 6 hours) + 6 hours`.

## Activation-window tests

### GS-TIME-01 — Before 48-hour window

Expected: accepted staff sees scheduled assignment but `scan_enabled=false`; server rejects check-in.

### GS-TIME-02 — Inside 48-hour window

Expected: for an approved published event, accepted assignment becomes active and can scan.

### GS-TIME-03 — Event paused

Expected: Gate Staff scanner authority is disabled while event is not `published`.

### GS-TIME-04 — Missing approved version

Expected: organizer-governed event without approved live version cannot be scanned by Gate Staff.

## Ticket admission security tests

### GS-SCAN-01 — Personal live QR succeeds

Use current `EYA-LIVE-2-...` credential for assigned event.

Expected: one successful check-in and assignment audit linkage.

### GS-SCAN-02 — Personal live manual succeeds

Use current `LIVE-...` backup code.

Expected: one successful check-in.

### GS-SCAN-03 — Guest live succeeds

Use current `EYA-GUEST-2-...` / `GUEST-...` credential.

Expected: one successful check-in.

### GS-SCAN-04 — Offline guest succeeds

Use valid `EYA-OFFLINE-1-...` / `OFF-...` credential.

Expected: one successful check-in.

### GS-SCAN-05 — Permanent ticket reference rejected

Attempt to use permanent `EYA-...` ticket reference as QR/manual admission input.

Expected: rejected. Permanent references remain non-admission identifiers.

### GS-SCAN-06 — Wrong event rejected

Gate Staff assigned to Event A attempts to scan valid Event B credential.

Expected: `Ticket is for another event.` No ticket state changes.

### GS-SCAN-07 — Duplicate check-in rejected

Scan the same valid ticket twice.

Expected: first succeeds, second is rejected as already checked in.

### GS-SCAN-08 — Expired credential rejected

Expected: expired live/guest/offline credential does not resolve to a ticket.

### GS-SCAN-09 — Revoked staff rejected server-side

Keep scanner UI open, revoke assignment from organizer account, then scan.

Expected: server rejects even if client has stale `scan_enabled=true` state.

### GS-SCAN-10 — Cross-event parameter tampering rejected

Manually alter scanner route/event ID to an event for which the staff account has no accepted assignment.

Expected: server rejects.

## Privacy / least-privilege tests

### GS-PRIV-01 — Gate Staff payload excludes customer contact details

Expected Gate Staff response may include holder name and ticket reference, but must not expose customer email or phone.

### GS-PRIV-02 — Gate Staff payload excludes finance details

Expected Gate Staff response must not expose order totals, payment status, paid time, or ticket price.

### GS-PRIV-03 — Organizer audit contains no raw credential

Expected organizer activity includes ticket reference, tier, scanner, gate, method, credential kind and timestamp only. Raw QR/manual values and credential hashes must never be returned.

### GS-PRIV-04 — Assignment table inaccessible directly

Expected `anon` and normal `authenticated` clients cannot directly select/insert/update/delete `ticket_gate_staff_assignments`; access is via governed RPCs.

## Audit tests

### GS-AUDIT-01 — Successful scan links assignment

Expected `ticket_checkins.scanner_assignment_id` is the accepted event assignment for Gate Staff scans.

### GS-AUDIT-02 — Gate label copied to check-in

Expected check-in stores the assignment gate label at scan time.

### GS-AUDIT-03 — Scanner access kind

Expected check-in metadata records `scanner_access_kind = gate_staff` for Gate Staff and `admin` for Admin scanner.

### GS-AUDIT-04 — Organizer activity totals

Expected issued, checked-in, remaining, recent-15-minute and active-staff metrics match underlying ticket/check-in rows.

## Admin regression tests

### GS-ADMIN-01 — Admin scanner still works

Expected Admin can scan supported live/guest/offline credentials without an event-scoped Gate Staff assignment.

### GS-ADMIN-02 — Admin response remains richer

Expected Admin scanner can retain customer/order details required by the existing Admin workflow; Gate Staff receives minimized data.

## Navigation tests

### GS-NAV-01 — Account → Workspaces

Expected Account `Workspaces` entry opens the verified workspace list rather than onboarding.

### GS-NAV-02 — Gate Staff workspace visibility

Expected Gate Staff card appears only when `get_my_gate_staff_assignments()` returns at least one assignment.

### GS-NAV-03 — Organizer → Gate Operations

Expected published/paused/archived event cards can open historical/current Gate Operations.

### GS-NAV-04 — Scanner event binding

Expected Gate Staff scanner is opened with the assigned `eventId` and refuses missing/unassigned event context.

## Production deployment sequence

After local tests pass:

1. Fetch/pull latest Gate Staff branch locally without touching unrelated local changes.
2. Confirm production migration history is aligned.
3. Run `supabase db push --dry-run`.
4. Review the proposed migration list manually.
5. Deploy only after the list contains exactly the approved Gate Staff migrations.
6. Run no-charge production smoke tests using test event/ticket records.
7. Revoke the test Gate Staff assignment and confirm access stops immediately.
8. Verify organizer audit rows and production logs.

## Stop conditions

Stop deployment immediately if any of these occur:

- Historical migration unexpectedly appears in dry run.
- Any Wallet/payment/provider migration appears.
- Gate Staff can scan another event.
- Unverified/wrong Auth account can accept an invite.
- Revoked staff can still scan.
- Gate Staff response exposes email, phone, payment or order financial data.
- Permanent ticket reference is accepted as an admission credential.
