# Supabase Migration History Reconciliation — 2026-08-23

Branch: `audit/reconcile-supabase-migration-history-20260822`

Status: `READ-ONLY RECONCILIATION IN PROGRESS — DO NOT DB PUSH`

This document records the observed production migration history against the migration files currently present in Git. It exists to remove ambiguity before any Supabase migration file is renamed, reconstructed, quarantined, replayed, or deployed.

## Safety rule

Until this reconciliation is completed and replay-tested on a disposable/local database:

- do not run a normal production `supabase db push`;
- do not rewrite `supabase_migrations.schema_migrations` merely to make timestamps match Git;
- do not assume two files with the same logical name/body are the same migration until the SQL body has been compared;
- do not deploy the planned Gate Staff / event-scoped scanner schema yet;
- do not use this reconciliation to modify Food, Marketplace, or Rooms product behavior;
- preserve the working ticket payment path.

The live database remains the authority for migrations that have already executed.

## Current observed drift

The migration history problem is primarily a version/timestamp divergence in the 2026-08-22 work. Production contains migrations whose logical names match Git files saved under different timestamps. Git also contains a duplicate migration version.

### A. Production versions that already match Git exactly by version/name

These are not the source of the current blocker:

- `20260822112548` — `ticket_event_early_payout_and_final_settlement_foundation`
- `20260822112703` — `add_ticket_event_advance_liability_metric`
- `20260822113850` — `harden_ticket_event_payout_approval_boundary`
- `20260822120307` — `ticket_organizer_stable_organization_ownership_foundation`
- `20260822131909` — `ticket_organizer_normal_account_workspace_identity`
- `20260822132416` — `ticket_organizer_workspace_helper_and_wording`
- `20260822132549` — `ticket_organizer_workspace_copy_cleanup`
- `20260822160447` — `ticket_organization_finance_ledger`
- `20260822160755` — `admin_list_ticket_organization_finance_ledgers`
- `20260822161133` — `serialize_ticket_liability_posting`
- `20260822161816` — `admin_list_ticket_organization_events`
- `20260822163849` — `fix_remaining_function_search_paths`
- `20260822164036` — `vac_callback_nonce_replay_protection`

### B. Same logical migration name, different production vs Git version

Each pair below must have its SQL body compared before the Git file is renamed/replaced.

| Production version | Production name | Current Git version |
| --- | --- | --- |
| `20260822091026` | `temporary_organizer_invites` | `20260822112500` |
| `20260822091918` | `temporary_organizer_auth_bans` | `20260822120500` |
| `20260822091957` | `temporary_organizer_regrant` | `20260822122000` |
| `20260822092413` | `organizer_temporary_identity_only` | `20260822123500` |
| `20260822101133` | `organizer_event_ticket_approval_integrity` | `20260822101500` |
| `20260822101255` | `harden_ticket_approval_trigger_permissions` | `20260822102500` |
| `20260822102422` | `ticket_event_live_revision_workflow` | `20260822123500` |
| `20260822103343` | `harden_ticket_revision_trigger_context` | `20260822124500` |
| `20260822112957` | `normalize_ticket_payout_mpamba_method` | `20260822112630` |
| `20260822113203` | `admin_ticket_event_finance_event_list` | `20260822112915` |
| `20260822145731` | `restore_public_operational_rls` | `20260822180000` |
| `20260822145812` | `lock_internal_subscription_functions` | `20260822181500` |
| `20260822150400` | `restrict_commerce_mutations` | `20260822183000` |
| `20260822150633` | `prevent_profile_role_escalation` | `20260822184500` |
| `20260822151046` | `ticket_organization_finance_entitlements` | `20260822190000` |
| `20260822151903` | `use_organization_finance_entitlements` | `20260822191500` |
| `20260822152051` | `ticket_finance_workspace` | `20260822193000` |
| `20260822153135` | `ticket_verified_payout_destinations` | `20260822194500` |
| `20260822153634` | `bind_payout_requests_to_verified_destination` | `20260822200000` |
| `20260822153700` | `admin_list_payout_destinations` | `20260822201500` |
| `20260822154155` | `expose_finance_entitlement_status` | `20260822203000` |

### C. Production migrations with no exact-version Git file

These were executed in production and therefore need exact live reconstruction in Git from `supabase_migrations.schema_migrations.statements` before normal migration tooling can be trusted again:

- `20260822140412` — `suspend_wallet_client_surface`
- `20260822141209` — `harden_notifications_and_obvious_anon_rpc_surface`
- `20260822141401` — `harden_vendor_catalog_and_messaging_rls`
- `20260822142439` — `server_authoritative_commerce_checkout_quote`

Do not replace these with later re-authored files merely because the intent looks similar. Restore the actual executed production SQL under the actual production version.

### D. Critical duplicate Git version

Git currently contains two distinct migration files using the same version:

- `20260822123500_organizer_temporary_identity_only.sql`
- `20260822123500_ticket_event_live_revision_workflow.sql`

Production did **not** execute both under `20260822123500`. Their observed production versions are:

- `organizer_temporary_identity_only` -> `20260822092413`
- `ticket_event_live_revision_workflow` -> `20260822102422`

This duplicate version must be eliminated as part of reconstruction.

### E. Git-only migrations that must not be pushed automatically

These files are not present in the observed live migration history and must remain quarantined/pending until a deliberate decision is made:

- `20260822170000_suspend_wallet_attack_surface.sql`
- `20260822172500_harden_food_payment_authority.sql`

`20260822170000_suspend_wallet_attack_surface.sql` overlaps the already-executed Wallet suspension migration but also contains additional cleanup such as dropping historical RLS policies. The live database currently blocks Wallet table access through grants and limits `wallet_checkout_campus_market` to `service_role`; therefore this file must not be treated as an already-executed migration simply because its intent overlaps production.

`20260822172500_harden_food_payment_authority.sql` is deliberately not a current delivery priority. Food, Marketplace, and Rooms are frozen/ignored while their product future is reviewed. Do not deploy this migration as part of ticket/scanner work.

## Current product impact

This reconciliation is required to safely add future ticket migrations such as the event-scoped Gate Staff scanner model. It is **not** permission to alter the working ticket purchase rails or to resume Food/Marketplace/Rooms payment work.

Ticket invariants to preserve during reconciliation:

- Airtel Money remains working;
- TNM Mpamba remains working;
- Bank Transfer remains working;
- Card remains working;
- VAC Payments remains the provider-facing ticket payment authority;
- verified callback fulfilment remains the ticket issuance authority;
- permanent ticket references remain non-admission references;
- Gate Staff schema is not deployed until migration history is trustworthy.

## Safe reconciliation sequence

1. Export exact live `version`, `name`, and `statements` for every mismatched/live-only migration above.
2. Compare each current Git SQL body with the live executed SQL body.
3. For body-identical logical duplicates, reconstruct the migration in Git under the exact live production version and retire the re-authored version from the active migration directory.
4. For body-different migrations, preserve the exact live migration first, then classify the Git delta as either:
   - genuinely pending and still required;
   - obsolete/superseded;
   - deliberately quarantined because the product is frozen/under review.
5. Restore the four production-only migrations exactly as executed.
6. Resolve the duplicate `20260822123500` version by restoring both migrations at their actual live versions.
7. Ensure the active `supabase/migrations/` directory has unique versions and reflects the full live migration history in order.
8. Move intentionally non-deployable pending work out of the active push path rather than leaving it where a blanket push can execute it accidentally.
9. Run a clean local/disposable database replay from migration zero.
10. Compare the replayed schema, functions, grants, RLS, and critical ticket objects to production.
11. Only after that comparison passes, clear the `DO NOT DB PUSH` blocker.
12. Then create the additive Gate Staff migration/RPC work as a new migration after the reconciled live head.

## Next reconciliation batch

The next implementation step should compare SQL bodies for the early mismatch group first:

- temporary organizer invite/auth/regrant/identity migrations;
- organizer approval integrity/trigger migrations;
- ticket live revision workflow/trigger migration.

That batch also resolves the duplicate `20260822123500` problem and provides a repeatable method for the later finance/security timestamp mismatches.
