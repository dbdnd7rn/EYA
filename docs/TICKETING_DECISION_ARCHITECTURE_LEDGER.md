# EYA Ticketing Decision & Architecture Ledger

Last reconciled: 2026-08-22
Branch: `feat/hybrid-checkout`

This document is the product/security/finance source of truth for EYA ticketing. It exists to stop decisions from being lost across conversations or accidentally replaced by implementation shortcuts.

Status meanings:
- `DECIDED` — product/security rule is agreed and should be preserved.
- `IMPLEMENTED` — rule is already enforced in code/database.
- `NEEDS REVISION` — current implementation exists but no longer exactly matches the agreed direction.
- `NOT BUILT` — agreed direction exists but implementation is missing.
- `OPEN DECISION` — do not hard-code until product decision is made together.
- `BLOCKER` — must be resolved before real organizer money moves.

---

## 1. Non-negotiable ticketing invariants

### Organizer access is private and Admin-issued
Status: `DECIDED + IMPLEMENTED`

- Normal students/customers must not see a public `Host event` or `Become an organizer` path.
- Organizer access is created only by EYA Admin invitation.
- Organizer login is separate from normal customer/student access.
- Organizer access is temporary, revocable, and expirable.
- Historical identity/audit/financial records must survive access expiry or revocation.
- A normal EYA customer account must not be silently converted into an organizer account.

### Organizer create/submit never means publish
Status: `DECIDED + IMPLEMENTED`

- Organizer creates a private draft.
- Organizer submits the event and its ticket configuration to EYA.
- Customer discovery, checkout, payment, and ticket issuance remain blocked until Admin approval.
- Admin approves the event AND the submitted ticket configuration together.

### Published organizer events require EYA approval integrity
Status: `DECIDED + IMPLEMENTED`

- `status = published` alone is not enough for an organizer-owned event.
- The event must have a real EYA approval version/hash.
- Checkout must fail closed if the currently sold event/ticket terms no longer match the approved configuration.

### Published changes require another Admin review
Status: `DECIDED + IMPLEMENTED`

- Current approved customer terms remain live while proposed changes wait for Admin.
- Organizer saving/submitting proposed changes must never alter what customers currently see or pay.
- Only Admin approval can replace the current live configuration.
- Price, capacity, venue, dates, ticket availability, sale windows, major event details, and similar material changes require approval.

### Product wording for revisions
Status: `DECIDED + NEEDS REVISION`

Customer/organizer/Admin UI should use product language such as:
- `Current live event`
- `Current approved tickets`
- `Proposed changes`
- `Approve proposed changes`

Do not expose database-style `V1`, `V2`, `Customer version V2`, or `Approve V2` as primary user-facing terminology. Internal version numbers may remain for audit/debugging.

### Admission authority
Status: `DECIDED + IMPLEMENTED, LEGACY CLEANUP STILL REQUIRED`

- Permanent `EYA-...` ticket code is a reference only and must never admit.
- Normal personal admission uses rotating live credentials.
- Guest/offline bearer modes are explicit exceptions with their own revocation/reissue semantics.
- Legacy static-ticket-code admission helpers must be removed/disabled before broad rollout.

---

## 2. Organizer identity and ownership

### Temporary Organizer Workspace
Status: `DECIDED + IMPLEMENTED`

- Admin creates a one-time invitation.
- Invitation creates a separate temporary organizer auth identity.
- Trusted server metadata marks the temporary organizer class.
- Organizer route isolation prevents falling into normal student/customer workspace.
- Revoke bans organizer auth immediately.
- Re-enable can restore the same organizer identity while preserving old grant history.

### Promoter / Organization entity
Status: `DECIDED DIRECTION + NOT BUILT`

Long-term ownership should not live primarily on a temporary login.

Required model:

`Promoter / Organization`
- stable organization identity
- verified legal/contact identity
- owns events
- owns event financial ledger
- owns payout destinations
- owns refund/advance liabilities
- owns payout history
- can have temporary organizer members/users

Temporary users may expire without changing who owns the event money or liabilities.

Current gap:
- organizer-owned events and finance are still primarily tied to temporary `auth.users` identities.

### Operational access vs financial entitlement
Status: `DECIDED DIRECTION + NOT BUILT`

Separate these concepts:

1. `Organizer Operations Access`
   - create/edit/manage events
   - temporary and revocable

2. `Finance / Settlement Entitlement`
   - view statements
   - see refunds/advances/liability
   - receive final settlement
   - survive Event Studio expiry until the financial relationship is closed

Current conflict:
- organizer finance RPCs currently depend on active temporary Organizer Workspace access.

---

## 3. Customer ticket ownership and sharing

### Account transfer
Status: `DECIDED + IMPLEMENTED`

- Sender remains owner while transfer is pending.
- Acceptance atomically changes current issued-ticket owner.
- Prior live credential is invalidated.
- Recipient mints a new live credential.

### Wallet ownership source
Status: `DECIDED DIRECTION + NEEDS REVISION`

- `issued_tickets.user_id` / Supabase issued-ticket ownership should be authoritative after transfer.
- Legacy backend purchaser/order ownership must not override current issued-ticket ownership in My Tickets.

### External recipient / guest direction
Status: `DECIDED DIRECTION + NOT BUILT AS FINAL PRODUCT`

Preferred direction:
- smart invite
- EYA installed -> open EYA
- not installed -> install/claim handoff
- admission credential ultimately lives inside EYA

Current browser guest-pass implementation is not the intended final primary flow.

Open sub-decision:
- accountless Guest Wallet inside EYA vs mandatory full EYA account.

### Offline / printable fallback
Status: `OPEN DECISION`

Need to decide whether offline printable bearer fallback is:
- exceptional organizer/Admin-configured recovery mode; or
- generally available.

Recommended direction remains exceptional fallback because screenshots/prints are bearer credentials.

---

## 4. Payment collection model

### PayChangu Connect
Status: `EXPLORED, NOT CURRENT PLAN`

- A PayChangu Connect app was created only for exploration.
- EYA must not depend on Connect for launch.
- No organizer Connect authorization should be treated as required.
- Current launch direction is EYA-controlled collection and organizer settlement.
- Revisit Connect only if PayChangu later provides controls that satisfy refund/hold/cancellation requirements.

### Launch collection model
Status: `DECIDED`

Preferred flow:

Customer -> EYA checkout -> PayChangu collection -> EYA event ledger -> protected reserve / fees / organizer payable -> controlled Early Payout -> Final Settlement.

Reason:
- immediate organizer settlement creates unacceptable cancellation/refund exposure.
- holding 100% until after every event can starve legitimate organizers of production cash.
- controlled advances + reserve balance both needs.

### PayChangu settlement destination
Status: `DECIDED DIRECTION, VERIFY CONFIGURATION`

Preferred operational direction is to keep funds available for controlled API payouts rather than automatically sending every settlement to EYA bank before event reconciliation.

Must verify the exact PayChangu settlement configuration before production organizer payouts.

---

## 5. Early Payout / Event Advance

### Product rule
Status: `DECIDED + FOUNDATION IMPLEMENTED`

- Pre-event organizer money is called `Early Payout` or `Event Advance`, not `Withdraw`.
- It is an advance against future event settlement, not fully earned final proceeds.
- Organizer explicitly requests it.
- One open request at a time per event is currently enforced.
- Admin may approve less than requested.
- Decline should carry a reason.
- Approval reserves that amount so it cannot be requested twice.

### Required risk checks
Status: `PARTLY IMPLEMENTED, PARTLY MISSING`

Before Early Payout is allowed, EYA should verify:
- organizer/promoter remains valid
- event remains EYA-approved
- event is not cancelled/financially frozen
- money is actually settled/available, not merely customer-paid
- protected refund reserve remains sufficient
- no unresolved fraud/dispute/manual hold
- no organizer/promoter-level liability requiring offset
- requested amount is within eligible amount

Current implementation has event approval, event status, reserve/hold, and event-level available-balance checks, but not all of the items above.

### Settled-funds authority
Status: `BLOCKER + NEEDS REVISION`

Current finance calculation treats `ticket_orders.payment_status = paid` as available event money.

That proves the customer paid, but does not necessarily prove PayChangu has settled the funds into the balance available for organizer payout.

Required financial states should distinguish at least:
- paid/confirmed
- verified
- settled/available for organizer payout

Only settled/available money may fund Early Payout.

Do not connect real PayChangu payout execution until this is corrected.

### Risk-based reserve and advance limits
Status: `DECIDED DIRECTION + NOT AUTOMATED`

Examples discussed:
- new/high-risk organizer -> smaller advance / larger reserve
- verified good-history organizer -> larger advance / medium reserve
- established low-dispute promoter -> higher advance limit / smaller reserve
- suspicious event -> no advance

Do not hard-code example percentages such as 50%, 70%, 80%, or Eventbrite-style 20% reserve as universal EYA rules.

Current controls are Admin-entered amounts, which is acceptable for first controlled rollout.

---

## 6. Final Settlement

### Product rule
Status: `DECIDED + FOUNDATION IMPLEMENTED`

Final Settlement happens only after:
- event has finished
- reconciliation is performed
- refund reserve is cleared/reduced appropriately
- manual holds are cleared
- no organizer advance liability remains

The last completed final-settlement payout may close the event finance account.

### Mandatory grace / dispute window
Status: `OPEN DECISION`

Need to define whether final settlement becomes eligible:
- event end + 1 day
- event end + 7 days
- event end + another risk-based/support/refund window
- Admin-controlled per event

Current system checks event completion but does not enforce a mandatory post-event waiting period.

---

## 7. Refunds

### Refund reserve concept
Status: `DECIDED + FOUNDATION IMPLEMENTED`

- Some event money remains protected from Early Payout.
- Refunds reduce organizer payable.
- If already-paid advances exceed what the event can support, EYA must show organizer advance liability and block further payouts.

### Real refund lifecycle
Status: `BLOCKER + NOT BUILT`

Reserve accounting is not a refund subsystem.

Need a first-class ticket refund model with states such as:
- requested
- approved
- processing
- succeeded
- failed
- reversed/voided if relevant

A refund record should link:
- original order/payment
- event
- organizer/promoter
- refund amount
- reason
- payment rail
- provider reference
- requester/approver
- timestamps
- provider response/audit

Successful refund must atomically reconcile:
- ticket order/payment status
- issued-ticket status -> refunded/invalid
- live credential revocation
- guest/offline credential revocation where applicable
- event financial ledger
- organizer payable/liability
- customer refund audit

### PayChangu refund rails
Status: `BLOCKER / EXTERNAL VERIFICATION REQUIRED`

Card refund API documentation was clearer during research than Airtel Money / TNM Mpamba refund handling.

Before production refund automation, confirm PayChangu's supported refund process for each collection rail.

---

## 8. Cancellation, pause, disputes and payout safety

### Cancellation should freeze finance
Status: `DECIDED + NOT FULLY IMPLEMENTED`

Required behavior:

Event cancelled -> immediately freeze new organizer payouts -> begin refund/reconciliation workflow -> use controlled event funds/reserve -> calculate any remaining organizer/promoter liability.

Current gap:
- there is not yet a complete automatic event-status -> finance-freeze/refund workflow.

### Payout approval is not irrevocable execution authority
Status: `BLOCKER + NEEDS REVISION`

Admin approval should mean:
- EYA authorizes up to this amount subject to final execution checks.

Immediately before money leaves EYA, the server must re-check:
- payout request still valid
- event still eligible
- event/finance not cancelled/frozen
- no new refunds/disputes/holds
- settled provider balance still supports payout
- protected reserve remains satisfied
- organizer/promoter global liability is clear or correctly offset
- amount remains within safe payable balance

Current manual `record payout paid` foundation largely trusts the earlier approved request and is not sufficient as the final production payout executor.

Do not wire real PayChangu payout API to that function as-is.

---

## 9. Organizer / promoter liability

### Event-level liability
Status: `IMPLEMENTED FOUNDATION`

Current finance snapshot can calculate advance liability when already-paid/approved advances exceed the event's currently supportable funds.

### Cross-event / promoter-level liability
Status: `DECIDED DIRECTION + NOT BUILT`

Example:
- Promoter owes EYA MWK 2M from Event A.
- Event B has MWK 5M otherwise payable.
- EYA should not blindly pay the full MWK 5M.

Need stable promoter-level ledger/hold/offset rules.

This is another reason to introduce a Promoter / Organization entity before production payouts.

---

## 10. Payout destinations

Status: `NOT BUILT`

Need verified payout beneficiaries belonging to the stable promoter/organization, not a temporary organizer login.

Possible methods:
- Airtel Money
- TNM Mpamba
- Malawi bank account

Need fields/audit for:
- beneficiary name
- phone/account details stored securely
- bank/network
- verification status
- added/changed by
- Admin approval if required
- change history
- primary/default destination

Sensitive financial details must not be exposed unnecessarily in organizer/admin UI logs.

---

## 11. EYA fee and payment costs

### EYA business model
Status: `OPEN DECISION`

Examples used in discussions (such as 5%) were illustrative, not final policy.

Need to decide whether EYA earns through:
- customer service fee
- organizer commission
- hybrid model
- fixed + percentage fees

### Provider/payout/refund costs
Status: `NOT FULLY MODELED`

Need to explicitly decide/account for:
- PayChangu collection fees
- organizer payout fees
- refund processing costs where applicable
- who bears each cost

Current event finance controls contain a manual platform-fee MWK amount but do not yet represent a complete provider-fee ledger.

---

## 12. Finance ledger target model

Status: `DECIDED DIRECTION + NOT BUILT AS COMPLETE LEDGER`

Before real organizer payouts, finance should reconcile explicit ledger entries rather than infer everything only from mutable order status.

Recommended event/promoter finance entries include:
- ticket sale confirmed
- provider settlement available
- EYA fee
- provider collection fee
- reserve increase/decrease
- refund initiated
- refund succeeded/failed
- manual risk hold/release
- Early Payout approved
- Early Payout executed
- payout failed/reversed
- final settlement approved
- final settlement executed
- organizer/promoter liability
- liability repayment/offset

Every entry should be immutable/auditable and trace back to order/payment/refund/payout/provider references.

---

## 13. Ticket Studio and event operations backlog

Status: `PAUSED UNTIL ARCHITECTURE RECONCILIATION IS COMPLETE`

Do not prioritize new Ticket Studio polish ahead of finance/refund architecture blockers.

Later features include:
- multiple flexible ticket types/templates
- max tickets per order
- private/access-code tiers
- organizer workspace tabs: Overview, Sales, Attendees, Check-in, Staff, Payouts, Activity
- event-scoped scanner staff roles
- Access Desk recovery flow
- offline-capable secure mobile admission

---

## 14. Known security / ownership cleanup before broad rollout

### Legacy static admission helpers
Status: `BLOCKER BEFORE BROAD ROLLOUT`

Audit/remove/hard-disable legacy helpers that can admit or derive QR from permanent `ticket_code`.

### My Tickets transferred ownership
Status: `NEEDS REVISION`

Supabase `issued_tickets.user_id` must be the authority for current holder after transfer.

### Event-scoped scanner staff
Status: `NOT BUILT`

Do not require stadium gate staff to be full EYA Admin.

### Broader legacy Supabase security backlog
Status: `SEPARATE AUDIT REQUIRED`

Older unrelated public tables/functions still have RLS/search-path/SECURITY DEFINER warnings. Audit feature-by-feature instead of blindly toggling policies during ticketing work.

---

## 15. Blockers before real organizer money moves

All of these must be resolved before enabling PayChangu organizer payout execution:

1. Promoter / Organization stable ownership model.
2. Separate operations access from finance-settlement entitlement.
3. Real settled/available-funds authority; customer-paid alone is insufficient.
4. First-class refund lifecycle.
5. PayChangu refund process confirmed for each supported payment rail.
6. Automatic cancellation/finance freeze behavior.
7. Execution-time payout revalidation.
8. Promoter-level cross-event liability/offset.
9. Verified payout destination model.
10. EYA commercial fee model and provider-cost treatment agreed.
11. Final-settlement grace/dispute-window policy agreed.
12. Real payout executor must be idempotent and provider-reference audited.

Until those are complete, Admin payout approval remains accounting/workflow preparation only — not production authority to move money.

---

## 16. Current implementation that should remain intact during reconciliation

Preserve:
- proven Airtel/TNM/Mpamba/bank/card collection rails
- VAC backend amount authority and payment architecture
- rotating personal ticket credentials
- transfer ownership credential revocation
- organizer invite-only temporary identity
- Admin event + ticket approval
- approval-integrity checkout protection
- live-event proposed-change review workflow
- Early Payout / Final Settlement foundation as non-executing accounting workflow

Do not rewrite payment rails merely to implement organizer finance.

---

## 17. Immediate next work order

1. Update user-facing revision wording (`Current live` / `Proposed changes`).
2. Design and migrate stable Promoter / Organization ownership.
3. Separate organizer operations access from finance entitlement.
4. Design immutable event/promoter financial ledger with settled-funds state.
5. Build ticket refund lifecycle and credential invalidation.
6. Add cancellation/finance freeze rules.
7. Add promoter-level liability/offset rules.
8. Add verified payout destinations.
9. Decide EYA fees/provider-cost ownership and final-settlement grace period.
10. Only then implement PayChangu payout execution.

No new organizer-finance feature should skip ahead of this order without explicitly updating this ledger first.
