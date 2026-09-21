# EYA Event Gate Staff & Scanner Model

Last reconciled: 2026-08-23
Branch: `security/pass-1-20260822`

Status: `DECIDED DIRECTION + NOT BUILT`

This document defines the target model for event-scoped ticket scanners in EYA. It sharpens the earlier Ticketing Decision Ledger item that says stadium/gate staff must not need full EYA Admin access.

The existing rotating personal/guest/offline ticket credentials remain the admission authority. This model changes who may operate the scanner and how that permission is scoped; it does not change payment collection or ticket-purchase logic.

---

## 1. Core product rule

An organizer with valid `Ticket Management` access may invite a normal EYA account to become **Gate Staff** for one specific event.

Gate Staff:
- remain normal EYA users;
- do not become EYA Admins;
- do not receive Ticket Management, finance, payout, refund, or event-editing authority;
- may scan/check in tickets only for the assigned event;
- may see only the minimum event and attendee information required at the gate;
- lose scanner authority automatically after the event access window ends or immediately when revoked/cancelled.

The server, not the UI, is the authority for whether scanner access is active.

---

## 2. Invitation and assignment lifecycle

Recommended assignment states:

`invited -> accepted -> scheduled -> active -> expired`

Additional terminal states:

`declined`, `revoked`, `cancelled`

### Invite

- Organizer selects an event they control and invites an EYA account by email/account identity.
- The invitation is bound to the stable event ID and organizer organization ID.
- Organizer may optionally assign a gate/station label such as `Main Gate`, `VIP Gate`, or `North Entrance`.
- Invitation may be created before the 48-hour scanner window so staffing can be prepared in advance.
- Creating an invitation does not grant scanning authority.

### Accept

- Recipient accepts using the same normal EYA account.
- If the email does not yet have an EYA account, the future invite flow may guide the recipient to sign up/claim the assignment.
- Acceptance does not make the person an organizer or Admin.

### Scheduled

Recommended UX refinement:
- after acceptance, the assignment may be visible in `Account -> Workspaces` as **Gate Staff — <Event Name>** with a `Scheduled` badge and activation time;
- scanner controls stay locked until the server-calculated activation time.

This is preferable to hiding the assignment completely until 48 hours before the event because the staff member can confirm that the assignment exists and see when to report.

### Active

Default scanner activation:

`event.starts_at - 48 hours`

Full Gate Staff scanner workspace becomes usable only when:
- assignment is accepted;
- current time is inside the server-calculated access window;
- event remains approved/eligible for admission;
- event is not cancelled;
- assignment has not been revoked;
- assigned user is the authenticated EYA user.

### Expiry

Access must expire automatically.

Recommended default:

`coalesce(event.ends_at, event.starts_at + 6 hours) + 6 hour gate grace`

The grace period handles late arrivals, event overruns, and controlled exit/re-entry operations without leaving scanner authority alive for days.

Recommended safety cap:
- normal automatic scanner authority should never continue more than 24 hours after the configured event end without an explicit Admin-controlled operational override.

If event dates move, the activation/expiry window should be recalculated from the current approved event schedule rather than storing a permanent copied timestamp that silently becomes stale.

If the event is cancelled, scanner authority becomes inactive immediately regardless of the previous expiry date.

---

## 3. Workspace model

The workspace should be called **Gate Staff** or **Gate Operations**, not Admin Scanner.

Suggested first version:

### Before activation

Workspace card:
- Event name
- Venue
- Event date/time
- Assigned gate/station
- `Scanner opens <date/time>`
- assignment status

No scan button yet.

### During active window

Workspace contains:
- `Scanner`
- `My activity`
- event summary
- gate/station label
- current access-expiry time
- count of tickets personally checked in by this staff member

Do not expose:
- event finance/payouts;
- organizer payout destination;
- full customer directory;
- event editing;
- organizer access management;
- Admin controls.

### After expiry

Workspace becomes historical/read-only for a short period or moves to an assignment history view. It must no longer expose a functioning scanner.

---

## 4. Scanner authorization

The current scanner RPC is Admin-only. Target architecture must replace `Admin is allowed to scan` with:

`Admin OR active event-scoped Gate Staff assignment for this exact event`.

Every check-in request must carry the event ID.

Server checks should include:
1. authenticated user exists;
2. event ID is supplied;
3. actor is EYA Admin OR has an accepted, currently-active scanner assignment for that event;
4. assignment is not revoked/expired;
5. event is not cancelled and admission is open;
6. credential resolves to a ticket for the same event;
7. ticket is active and has not already been checked in;
8. credential is one of the supported live/guest/offline credential forms;
9. permanent `EYA-...` ticket references remain invalid admission credentials;
10. ticket update/check-in insert happen atomically under row locking.

UI visibility must never be the authorization boundary.

---

## 5. Proposed data model

Do not deploy this until Supabase migration history is reconciled.

### `ticket_gate_staff_assignments`

Suggested fields:
- `id uuid`
- `event_id uuid`
- `organization_id uuid`
- `user_id uuid null` until resolved/claimed if needed
- `invited_email citext/text`
- `status` (`invited`, `accepted`, `declined`, `revoked`)
- `gate_label text null`
- `invited_by uuid`
- `invited_at timestamptz`
- `accepted_at timestamptz null`
- `revoked_at timestamptz null`
- `revoked_by uuid null`
- `created_at`
- `updated_at`

Do not store copied permanent scanner activation/expiry timestamps as the sole authority if they can be derived from the approved event schedule. A server function should calculate effective access from event time + assignment state.

Useful constraints:
- one active assignment per `(event_id, user_id)`;
- organizer can manage assignments only for events owned by their organization;
- a scanner assignment grants no rights outside its event.

### Existing `ticket_checkins`

Keep it as the authoritative successful-admission audit trail.

Add/retain enough metadata to identify:
- `checked_in_by` user;
- event;
- issued ticket;
- check-in timestamp;
- method (`qr` / `manual`);
- credential kind (`personal_live`, `guest_live`, `offline_guest`);
- scanner assignment ID when applicable;
- gate/station label;
- opaque scanner session/device identifier where useful.

Never store the raw rotating QR token or raw manual credential in the audit log.

### Optional later: `ticket_gate_scan_attempts`

For abuse/security operations, a separate append-only attempt table may record rejected scans without storing raw credentials.

Possible fields:
- event
- scanner assignment/user
- timestamp
- result class (`accepted`, `already_used`, `wrong_event`, `invalid`, `expired`)
- resolved ticket ID only when safely known
- credential kind
- gate/session metadata

This is optional for the first version. Successful check-ins already have a strong audit source in `ticket_checkins`.

---

## 6. Organizer scanner-management UI

Inside Event Studio, add a future `Gate Staff` / `Check-in` area.

Organizer should be able to:
- invite scanner by EYA account/email;
- view invitation state;
- set/edit gate label;
- revoke scanner access immediately;
- see activation and expiry times;
- see each scanner's successful check-in count;
- see last scan time;
- see event-wide check-in totals.

Organizer should not be able to grant any scanner access to another event/organization they do not control.

Recommended status labels:
- Invited
- Accepted · Opens in 2 days / Opens <time>
- Active
- Expired
- Revoked

---

## 7. Organizer audit/activity view

The organizer should have a read-only event check-in audit showing, at minimum:
- time;
- scanner/staff member name;
- gate/station;
- ticket reference;
- ticket type;
- credential kind;
- check-in method;
- successful status.

Recommended summary cards:
- Tickets sold
- Checked in
- Remaining not checked in
- Check-ins in the last 15 minutes
- Active scanners

Recommended per-staff summary:
- staff name
- gate
- scans completed
- last scan
- active/expired status

Privacy rule:
- do not expose customer phone/email to ordinary Gate Staff unless a future Access Desk role explicitly requires it;
- organizer audit can identify the ticket/holder as needed for operations, but should still avoid unnecessary sensitive customer data.

---

## 8. Undo / correction rule

Normal Gate Staff must **not** be able to undo a successful check-in.

Reason:
- allowing a scanner to re-open a used ticket creates an easy fraud/re-entry path.

If check-in correction is later required, use a separate privileged **Access Desk / Supervisor** workflow with:
- reason required;
- actor recorded;
- before/after audit;
- re-entry credential rotation/revocation handled server-side.

This should not be part of first-version Gate Staff permissions.

---

## 9. Security controls

Minimum controls:
- event-scoped server authorization on every scan;
- current approved event ID required on every scan;
- automatic cancellation/revocation/expiry enforcement;
- rate limiting per scanner assignment/user/device;
- no raw credential logging;
- no Admin role reuse;
- no organizer finance/edit permissions inherited by scanner;
- ticket row locking and single-use check-in semantics preserved;
- wrong-event credentials rejected before admission;
- permanent ticket references never accepted;
- audit `checked_in_by` on every successful admission.

Recommended operational hardening:
- generate an opaque scanner session ID when Gate Operations opens;
- include session/gate metadata in check-ins;
- expire sessions after inactivity or assignment expiry;
- allow organizer/Admin to terminate an active scanner assignment immediately.

---

## 10. Event changes and exceptional cases

### Event postponed

Assignment remains associated with the event, but activation/expiry recalculates from the newly approved event schedule.

### Event cancelled

All Gate Staff scanner authority ends immediately.

### Organizer Ticket Management expires before the event

Historical event ownership and existing scanner assignments remain auditable. Whether the organizer may still manage gate staffing should follow the event operations-access policy; the scanner itself must never gain broader authority because organizer access changed.

### Scanner account disabled/banned

Authentication/account restrictions override the assignment.

### No internet

Do **not** treat ordinary offline bearer tickets as equivalent to offline scanner authorization.

A future offline-capable scanner needs its own design with event-scoped signed manifests, local anti-replay state, synchronization/conflict handling, and revocation rules. First rollout should remain online/server-verified unless that offline security model is explicitly approved.

---

## 11. Current implementation mapping

Already implemented and should be preserved:
- rotating personal live ticket credentials;
- guest/offline credential exceptions;
- permanent `EYA-...` ticket reference rejection;
- atomic single-use ticket check-in;
- `ticket_checkins.checked_in_by` audit actor;
- client helper already accepts an `eventId` for gate validation.

Current gap:
- scanner screen is Admin-oriented;
- live `check_in_ticket_entry_credential` requires full Admin;
- no event-scoped Gate Staff assignment table/RPC exists in production.

---

## 12. Safe implementation order

Because Supabase migration-history reconciliation is still an operational blocker, do not push this schema directly to production yet.

Recommended order:
1. keep this architecture decision in docs;
2. finish/reconcile Supabase migration history;
3. add additive Gate Staff assignment schema + RLS/RPCs in Git;
4. add server-side `can_scan_ticket_event(event_id)` authority;
5. harden/extend check-in RPC to require exact event scope for Gate Staff;
6. build Gate Staff workspace and invitation/acceptance UI;
7. build organizer Staff + Check-in Activity views;
8. test activation at T-48h, expiry, cancellation, revocation, wrong-event scans, duplicate scans and account changes;
9. only then retire Admin as the normal stadium-gate operating model.

No payment rail, VAC Payments flow, PayChangu collection code, ticket amount logic, or customer checkout logic should be changed to implement Gate Staff.