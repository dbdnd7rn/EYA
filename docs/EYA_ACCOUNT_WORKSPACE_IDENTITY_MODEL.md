# EYA Account & Workspace Identity Model

Last reconciled: 2026-08-22
Branch: `feat/hybrid-checkout`

This document defines how EYA should think about a person, their normal app access, and any business/job workspaces they are allowed to use.

## Core rule

Every person has one normal EYA account.

Being approved for a specialized workspace ADDS capabilities. It must not remove ordinary EYA user capabilities.

A person may therefore use the normal EYA experience and one or more specialized workspaces with the same identity.

## Base identity

Product concept:

`EYA User`

Normal authenticated EYA user capabilities include customer/personal actions such as:
- browse rooms/hostels;
- send room enquiries and messages;
- reserve/book/pay for eligible accommodation flows;
- save normal user content;
- buy tickets;
- use My Tickets;
- order food as a customer;
- shop marketplace items;
- use account/profile, addresses, notifications and other personal features.

These abilities must not depend on `profiles.role = 'student'`.

The current database value `student` is a legacy authorization/profile label and should be treated as the historical name for the normal User workspace while migration is in progress.

Student status, school and university may later remain as profile attributes, but they must not be the gate for ordinary EYA customer access.

## Specialized workspaces

Optional workspaces are permissions/capabilities, not replacement identities.

Current target set:
- `Landlord`
- `Food Provider`
- `Delivery Agent`
- `Ticket Management`
- `Admin`

A user can legitimately have multiple specialized workspaces.

Example:

```text
John — one EYA account

Personal / User       ACTIVE always
Food Provider         APPROVED
Landlord              APPROVED
Ticket Management     NONE
Delivery Agent        NONE
```

John remains able to book a room, buy a ticket or message a landlord while also managing his Food Provider business.

## Active workspace

`activeWorkspace` means only:

> Which dashboard/toolset is the person currently viewing?

It must NOT mean:

> What kind of human is this person allowed to be?

Example:

`activeWorkspace = food_provider`

means EYA should show Food Provider business tools. It must not revoke access to Personal/User routes.

## Workspace discovery UI

Preferred product placement:

`Account -> Workspaces`

The page should always show the Personal/User workspace.

Specialized workspace cards/buttons appear only when the server says the user is approved/authorized for that workspace.

Example:

```text
WORKSPACES

Personal
User                      OPEN

Verified workspaces
Food Provider             OPEN
Landlord                  OPEN
Ticket Management         OPEN
```

A normal user without those permissions must not see their management buttons.

UI hiding is not authorization. Direct navigation must still be blocked server-side/client-guard-side when specialized permission is absent.

## Authorization rule

Normal EYA action:
- authenticated EYA user is enough unless the specific feature has another legitimate safety/business requirement.

Specialized business action:
- corresponding verified workspace permission is required.

Examples:
- create/manage room listings -> Landlord permission;
- manage food vendor/menu/orders -> Food Provider permission;
- accept delivery work -> Delivery Agent permission;
- create/manage organizer events -> Ticket Management permission;
- Admin moderation -> Admin permission.

## Specialized workspace guards

Keep independent guards/checks for privileged workspaces:
- `LandlordGuard` -> landlord authorization;
- `SellerGuard` -> Food Provider authorization;
- `AgentGuard` -> Delivery Agent authorization;
- `AdminGuard` -> Admin authorization;
- Ticket Management -> organizer/promoter workspace authorization.

The normal customer route tree should use a generic `UserGuard` whose main requirement is an authenticated EYA account, not `role === student`.

## Current migration state

### Implemented first step

- `components/UserGuard.tsx` added.
- `app/(student)/_layout.tsx` now uses `UserGuard`.
- Food Provider/Landlord/Delivery/Admin accounts are no longer redirected out of the normal customer area solely because their active workspace is specialized.

The internal route folder name `(student)` remains legacy naming for now and does not mean only students may use it.

### Legacy checks still to remove/revise

- Room Details still has explicit `role === 'student'` checks for Save Room and Write Review.
- Some customer data columns/types use legacy names such as `student_id` or `sender_role = 'student'`; many are participant-slot names rather than true authorization. Rename only when safe; do not break working data merely for cosmetic cleanup.
- `profiles.role` still contains one legacy primary value (`student`, `landlord`, `agent`, `vendor`, `admin`). It remains for backward compatibility while workspace permissions become authoritative.
- auth/profile synchronization triggers still write a single role value and must eventually stop being the source of authorization truth.

## Organizer decision revision

Previous design:
- separate temporary Organizer auth account;
- organizer identity excluded from normal Personal/User routes.

Revised direction:
- organizer is a normal EYA account;
- Admin grants/verifies `Ticket Management` workspace permission;
- permission may be tied to a stable Promoter / Organization;
- Ticket Management card appears only while/when authorization permits;
- the Promoter / Organization remains the stable owner of events, finance and liabilities;
- the human account remains the actor/member.

The existing separate temporary-organizer implementation is now a migration target, not the desired final identity model.

## Landlord / Food Provider / Delivery migration direction

Do not make `profiles.role` the permanent authority for these workspaces.

Preferred future authorization source:
- explicit workspace permission/application/verification state;
- domain evidence where intentionally supported during migration;
- Admin approval where required.

Legacy role values may temporarily count as grandfathered access so existing users are not broken.

## Migration principles

1. Do not bulk-delete or rewrite existing user roles merely to make naming cleaner.
2. First remove normal-user feature gates that incorrectly require `student`.
3. Keep privileged workspace guards strict.
4. Make workspace permissions authoritative one feature at a time.
5. Preserve existing users through grandfathered legacy access during migration.
6. Only retire `profiles.role` from authorization after all dependent features are audited.
7. A workspace switch changes UI context, not the user's fundamental account rights.

## Phone regression tests required

Test with at least:
- existing Food Provider account;
- existing Landlord account;
- existing Delivery Agent account;
- Admin account;
- normal User account.

For each specialized account, confirm the person can still enter Personal/User and:
- browse rooms;
- open a room;
- send an enquiry/message;
- reach normal checkout where applicable;
- browse/buy tickets;
- use normal account features.

Then confirm they cannot open another specialized management workspace they do not have permission for.

## Status

Identity direction: `DECIDED`

Universal Personal/User route access: `FOUNDATION IMPLEMENTED, PHONE RETEST REQUIRED`

Legacy `student` feature checks: `NEEDS REVISION`

Single `profiles.role` as authorization source: `LEGACY / MIGRATION IN PROGRESS`

Separate temporary Organizer auth identity: `REVISED DIRECTION / MUST MIGRATE`
