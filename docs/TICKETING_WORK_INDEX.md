# EYA Ticketing Work Index

Use these documents together:

1. [`EYA_MASTER_ARCHITECTURE_AND_DELIVERY_PLAN.md`](./EYA_MASTER_ARCHITECTURE_AND_DELIVERY_PLAN.md)
   - whole-EYA architecture across both repositories
   - frontend / Supabase RPC / Edge Function / Cloudflare / Render placement rules
   - Wallet suspension rule
   - complete security threat-model categories
   - delivery priority order
   - Supabase migration-history reconciliation blocker

2. [`TICKETING_DECISION_ARCHITECTURE_LEDGER.md`](./TICKETING_DECISION_ARCHITECTURE_LEDGER.md)
   - ticketing product decisions
   - security invariants
   - finance rules
   - implementation mismatches
   - open decisions
   - blockers before real organizer money moves

3. [`EYA_ACCOUNT_WORKSPACE_IDENTITY_MODEL.md`](./EYA_ACCOUNT_WORKSPACE_IDENTITY_MODEL.md)
   - one-account identity model
   - Personal/User access for every authenticated EYA account
   - optional verified workspaces such as Landlord, Food Provider, Delivery Agent and Ticket Management
   - active workspace semantics
   - migration away from `student` as an authorization requirement
   - revised organizer identity direction

4. [`EYA_SECURITY_AUDIT.md`](./EYA_SECURITY_AUDIT.md)
   - both-repository attack surface
   - Supabase grants, RLS and privileged RPC findings
   - payment/backend authority boundaries
   - active security fixes and regression requirements

5. [`TICKETING_BUILD_TEST_BOARD.md`](./TICKETING_BUILD_TEST_BOARD.md)
   - phone tests
   - server-verified checks
   - current test status
   - implementation checkpoints

Rules:
- The Master Architecture & Delivery Plan defines whole-system boundaries and priority order.
- If a ticketing product/security/finance decision changes, update the Architecture Ledger.
- If the account/workspace identity model changes, update the Account & Workspace Identity Model.
- If implementation changes what must be tested, update the Build & Test Board.
- Security blockers in the Security Audit take priority over new finance or payout behavior.
- Do not use the test board as the source of truth for unresolved product decisions.
- Do not enable real organizer payout execution until every blocker in the Architecture Ledger and Master Plan is resolved.
- Do not run a normal production `supabase db push` from this branch until the migration-history reconciliation checkpoint in the Master Plan is completed.
