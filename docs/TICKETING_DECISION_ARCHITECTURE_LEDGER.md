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

- Normal users must not see a public `Host event` or self-serve `Become an organizer` path.
- Everyone signs in with their normal EYA account and retains normal Personal/User access.
- Ticket organizer capability is an additional verified workspace permission called `Ticket Management`.
- Ticket Management appears only when EYA Admin grants active organizer access.
- Grant expiry or revocation removes Ticket Management only; it must not ban or disable the person's normal EYA account.
- Organizer operations access may be temporary, revocable, and expirable.
- Historical identity/audit/financial records must survive access expiry or revocation.
- The retired separate `temporary_organizer` login/invite flow must not be used for new organizers.

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

### One EYA account + Ticket Management workspace
Status: `DECIDED + IMPLEMENTED`

- Organizer is not a separate account type.
- Organizer signs in exactly like any other EYA user and lands in the normal Personal/User experience.
- `Account -> Workspaces` shows Ticket Management only when an active Admin-issued organizer grant exists.
- Server access is still enforced even if a route is opened manually; hiding/showing the button is not the security boundary.
- Admin grants Ticket Management to an existing EYA account email and links that user to a stable Promoter / Organization.
- Revoke/expiry removes organizer tools without banning the person's auth identity or removing customer features/purchases.
- Legacy one-time temporary-organizer invitation creation/claim is disabled for new access.
- Current first version preserves one active Ticket Management promoter organization per user at a time. Multi-promoter membership/switching is not yet a decided product feature.

### Promoter / Organization entity
Status: `DECIDED + OWNERSHIP FOUNDATION IMPLEMENTED`

Stable ownership must not live primarily on a person's temporary permission.

Current implemented foundation:

`Promoter / Organization`
- stable organization ID
- organizer access grants carry `organization_id`
- organizer events carry `organization_id`
- event finance controls and payout requests carry `organization_id`
- event creation copies the organization from the active Ticket Management grant
- re-enable preserves the organization history

Additional finance foundations now attached to the stable organization:
- separate Finance / Settlement entitlements;
- verified payout-destination data model with masked client reads;
- immutable organization liability ledger supporting assessments, repayments, offsets and reversals.

Still required before production finance is complete:
- verified legal/contact identity and KYC/evidence retention policy;
- deploy and verify trusted encrypted payout-destination intake, key rotation and provider beneficiary verification;
- automatically post/apply refund/advance liabilities and cross-event offsets into payout eligibility;
- real payout execution/history/reconciliation at organization level;
- richer member/permission model if multiple people or multiple promoter organizations must be managed.

The normal EYA user remains the actor for audit fields such as created/submitted/requested-by, while the Promoter / Organization is the stable business/financial owner.

### Operational access vs financial entitlement
Status: `DECIDED + ENTITLEMENT FOUNDATION IMPLEMENTED`

Separate these concepts:

1. `Ticket Management Operations Access`
   - create/edit/manage events
   - temporary and revocable

2. `Finance / Settlement Entitlement`
   - view statements
   - see refunds/advances/liability
   - receive final settlement
   - survive Event Studio expiry until the financial relationship is closed

Implemented foundation:
- `ticket_organization_finance_entitlements` binds finance authority to the stable organization and user account separately from Ticket Management access;
- the first Ticket Management account for a new organization becomes its initial Finance Owner;
- later operations users do not automatically inherit finance authority;
- finance access can be active, suspended or revoked;
- Admin cannot revoke the final finance controller, or revoke while open payout/settlement work remains.

Workspace wiring implemented:
- `Account -> Workspaces` independently loads Finance & Settlement entitlements;
- Finance & Settlement remains visible when Ticket Management operations access expires;
- organization events open through a normal-account finance route rather than the operations-only Organizer guard.

Still required:
- provider-settlement authority;
- automatic organization-liability offset into event payout availability;
- production deployment/verification of trusted encrypted payout-destination intake and beneficiary verification.

---

## 3. Customer ticket ownership and sharing

### Account transfer
Status: `DECIDED + IMPLEMENTED`

- Sender remains owner while transfer is pending.
- Acceptance atomically changes current issued-ticket owner.
- Prior live credential is invalidated.
- Recipient mints a new live credential.

### My Tickets ownership source
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
- accountless guest ticket container inside EYA vs mandatory full EYA account.

This must not be confused with the suspended financial EYA Wallet system.

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

Current implementation has event approval, event status, reserve/hold, and event-level available-balance checks. An organization liability ledger foundation now exists, but automatic cross-event offset into payout availability is not yet wired.

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
- verified payout destination is still valid/current
- amount remains within safe payable balance

Current manual `record payout paid` foundation largely trusts the earlier approved request and is not sufficient as the final production payout executor.

Do not wire real PayChangu payout API to that function as-is.

---

## 9. Organizer / promoter liability

### Event-level liability
Status: `IMPLEMENTED FOUNDATION`

Current finance snapshot can calculate advance liability when already-paid/approved advances exceed the event's currently supportable funds.

### Cross-event / promoter-level liability
Status: `DECIDED + IMMUTABLE LIABILITY LEDGER FOUNDATION IMPLEMENTED; AUTOMATIC OFFSET PENDING`

Example:
- Promoter owes EYA MWK 2M from Event A.
- Event B has MWK 5M otherwise payable.
- EYA should not blindly pay the full MWK 5M.

Implemented foundation:
- `ticket_organization_finance_ledger` is owned by the stable Promoter / Organization;
- liability assessments are debits;
- liability repayments and cross-event liability offsets are credits;
- entries are append-only and updates/deletes are blocked;
- mistakes require explicit reversal entries;
- organization + idempotency-key uniqueness prevents duplicate posting;
- posting is serialized per organization so concurrent credits cannot both spend the same outstanding liability;
- only internally authorized Admin posting can mutate the liability ledger;
- Finance-entitled users receive scoped read access rather than direct table mutation.

Still required:
- automatic liability assessments from refund/cancellation/advance reconciliation;
- automatically subtract outstanding organization liability from safe payout eligibility;
- post auditable offset entries when Event B funds are used to clear Event A liability;
- ensure execution-time payout checks use the organization liability balance atomically.

---

## 10. Payout destinations

Status: `VERIFIED DESTINATION FOUNDATION IMPLEMENTED`

Verified payout beneficiaries belong to the stable Promoter / Organization, not an individual workspace permission.

Supported foundation methods:
- Airtel Money
- TNM Mpamba
- Malawi bank account

Implemented foundation:
- destinations belong to the stable Promoter / Organization;
- sensitive destination details are accepted only as trusted-backend ciphertext with an encryption-key version;
- browser roles have no direct table access and receive only masked destination metadata through an entitlement-bound RPC;
- destination fingerprints prevent duplicate records without exposing the account/phone value;
- Admin verification/rejection/disable transitions are explicit and append masked before/after audit records;
- only one verified destination may be marked primary per organization;
- payout requests can be bound to a verified organization destination in the data model;
- Admin listing returns masked destination metadata rather than raw secret account values.

Still required:
- deploy/configure the trusted-backend encrypted intake endpoint and document/test key rotation;
- organizer destination form and Admin verification UI regression testing;
- KYC evidence storage/retention decision;
- provider-side beneficiary verification and payout reconciliation;
- final payout executor must revalidate the destination immediately before sending money.

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

Status: `IMMUTABLE ORGANIZATION LIABILITY FOUNDATION IMPLEMENTED; COMPLETE EVENT LEDGER STILL PENDING`

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

Implemented without changing payment integrations:
- organization-owned append-only liability assessments, repayments, offsets and reversal entries;
- whole-MWK validation, event/organization binding and idempotency keys;
- mutation trigger blocks updates/deletes and requires compensating reversals;
- direct browser table access is denied;
- active or suspended finance-entitlement holders may read their organization ledger through a scoped RPC;
- only an internally authorized EYA Admin RPC may post entries;
- posting is serialized by organization to prevent concurrent over-credit races;
- organizer event finance can expose a read-only reconciliation equation and event-tagged liability history while keeping the organization total visible;
- Admin and finance-entitlement holders have dedicated ledger interfaces; neither interface executes or verifies payments.

Still required:
- automatic entries from the future refund/cancellation lifecycle;
- controlled cross-event offset allocation into event availability;
- full sales, provider-settlement, fee, reserve, payout and reversal accounts;
- automatic ledger links from event-level finance views as the complete event ledger is introduced.

---

## 13. Ticket Studio and event operations backlog

Status: `PAUSED UNTIL SECURITY / FINANCE ARCHITECTURE BLOCKERS ARE CLEARED`

Do not prioritize new Ticket Studio polish ahead of security, migration-history, finance/refund architecture blockers.

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

### Broader EYA security program
Status: `ACTIVE`

Security is tracked in `EYA_SECURITY_AUDIT.md` and the whole-system priority/boundary order is tracked in `EYA_MASTER_ARCHITECTURE_AND_DELIVERY_PLAN.md`.

Do not treat Supabase RLS as the entire security review. The audit also covers both repositories, Edge Functions, Cloudflare, Render, auth/session hijacking, privilege escalation, IDOR/BOLA, injection, XSS/SSRF-style boundaries, replay, race conditions, uploads, dependencies, secrets, logging and abuse/DoS.

### Supabase migration-history drift
Status: `OPERATIONAL BLOCKER BEFORE NORMAL DB PUSH`

The live migration history and some repository migration filenames are not fully aligned for part of the 2026-08-22 security/finance work.

Until reconciled, do not run an ordinary blanket production `supabase db push` from this branch. Follow the migration-history reconciliation checkpoint in the Master Plan.

---

## 15. Blockers before real organizer money moves

All of these must be resolved before enabling PayChangu organizer payout execution:

1. Real provider-settled / available-funds authority; customer-paid alone is insufficient.
2. First-class refund lifecycle.
3. PayChangu refund process confirmed for each supported payment rail.
4. Automatic cancellation -> finance freeze/reconciliation behavior.
5. Execution-time payout revalidation.
6. Automatic Promoter / Organization liability offset into payout eligibility and auditable offset posting.
7. Deploy/verify encrypted payout-destination intake, key rotation and provider beneficiary verification.
8. EYA commercial fee model and provider/payout/refund cost treatment agreed.
9. Final-settlement grace/dispute/refund-window policy agreed.
10. Real payout executor must be idempotent, replay-resistant and provider-reference audited/reconciled.

Until those are complete, Admin payout approval remains accounting/workflow preparation only — not production authority to move money.

---

## 16. Current implementation that should remain intact during reconciliation

Preserve:
- one EYA account with Personal/User access always available
- verified workspace model for specialized roles/jobs
- Admin-granted Ticket Management on the normal EYA account
- stable Promoter / Organization ownership foundation
- separate Finance / Settlement entitlement foundation
- verified payout-destination foundation
- immutable organization liability-ledger foundation
- proven Airtel/TNM/Mpamba/bank/card collection rails
- VAC backend amount authority and payment architecture
- rotating personal ticket credentials
- transfer ownership credential revocation
- Admin event + ticket approval
- approval-integrity checkout protection
- live-event proposed-change review workflow
- Early Payout / Final Settlement foundation as non-executing accounting workflow

Do not rewrite payment rails merely to implement organizer finance.

---

## 17. Immediate next work order

Whole-system priority is defined in `EYA_MASTER_ARCHITECTURE_AND_DELIVERY_PLAN.md`.

Ticketing/finance order from the current checkpoint:
1. Reconcile Supabase migration history before normal production db push.
2. Continue the cross-repository security audit and close high-impact authorization/session/replay/input issues.
3. Implement provider-settled / actually-available funds authority.
4. Build ticket refund lifecycle and credential invalidation.
5. Add automatic cancellation -> finance freeze/reconciliation.
6. Wire organization liability balance into payout eligibility and auditable cross-event offsets.
7. Decide EYA fees/provider-cost ownership and final-settlement grace period.
8. Implement the real idempotent/replay-resistant PayChangu payout executor only after all blockers pass.
9. Then return to Ticket Studio/product polish and remaining admission/sharing cleanup.

No new organizer-finance feature should skip ahead of this order without explicitly updating this ledger first.
