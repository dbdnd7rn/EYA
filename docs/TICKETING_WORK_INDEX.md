# EYA Ticketing Work Index

Use these two documents together:

1. [`TICKETING_DECISION_ARCHITECTURE_LEDGER.md`](./TICKETING_DECISION_ARCHITECTURE_LEDGER.md)
   - product decisions
   - security invariants
   - finance rules
   - implementation mismatches
   - open decisions
   - blockers before real organizer money moves

2. [`TICKETING_BUILD_TEST_BOARD.md`](./TICKETING_BUILD_TEST_BOARD.md)
   - phone tests
   - server-verified checks
   - current test status
   - implementation checkpoints

Rule:
- If a product/security/finance decision changes, update the Architecture Ledger first.
- If implementation changes what must be tested, update the Build & Test Board.
- Do not use the test board as the source of truth for unresolved product decisions.
- Do not enable real organizer payout execution until every blocker in the Architecture Ledger section `Blockers before real organizer money moves` is resolved.
