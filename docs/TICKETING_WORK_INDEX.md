# EYA Ticketing Work Index

Use these documents together:

1. [`TICKETING_DECISION_ARCHITECTURE_LEDGER.md`](./TICKETING_DECISION_ARCHITECTURE_LEDGER.md)
   - ticketing product decisions
   - security invariants
   - finance rules
   - implementation mismatches
   - open decisions
   - blockers before real organizer money moves

2. [`EYA_ACCOUNT_WORKSPACE_IDENTITY_MODEL.md`](./EYA_ACCOUNT_WORKSPACE_IDENTITY_MODEL.md)
   - one-account identity model
   - Personal/User access for every authenticated EYA account
   - optional verified workspaces such as Landlord, Food Provider, Delivery Agent and Ticket Management
   - active workspace semantics
   - migration away from `student` as an authorization requirement
   - revised organizer identity direction

3. [`TICKETING_BUILD_TEST_BOARD.md`](./TICKETING_BUILD_TEST_BOARD.md)
   - phone tests
   - server-verified checks
   - current test status
   - implementation checkpoints

Rules:
- If a ticketing product/security/finance decision changes, update the Architecture Ledger.
- If the account/workspace identity model changes, update the Account & Workspace Identity Model.
- If implementation changes what must be tested, update the Build & Test Board.
- Do not use the test board as the source of truth for unresolved product decisions.
- Do not enable real organizer payout execution until every blocker in the Architecture Ledger section `Blockers before real organizer money moves` is resolved.
