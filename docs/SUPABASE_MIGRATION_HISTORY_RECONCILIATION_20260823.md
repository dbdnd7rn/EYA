# Supabase Migration History Reconciliation — 2026-08-23

Branch: `audit/reconcile-supabase-migration-history-20260822`

Status: `RECONSTRUCTION IN PROGRESS — DO NOT DB PUSH`

This document records the observed production migration history against the migration files in Git. The goal is to make Git accurately reflect migrations that production already executed before any new Supabase migration—especially Gate Staff / event-scoped scanner work—is created or deployed.

## Safety rule

Until this reconciliation is completed and replay-tested on a disposable/local database:

- do not run a normal production `supabase db push`;
- do not rewrite `supabase_migrations.schema_migrations` merely to make timestamps match Git;
- do not deploy the planned Gate Staff / event-scoped scanner schema yet;
- do not use this reconciliation to modify Food, Marketplace, or Rooms product behavior;
- preserve the working ticket payment path;
- treat the live database migration ledger as the authority for migrations that have already executed.

## Reconciliation progress

### Completed: production-only migrations restored exactly

The following migrations existed in the live Supabase migration ledger but did not previously exist in Git under their production versions. They have now been restored from the exact SQL stored in `supabase_migrations.schema_migrations.statements`:

- `20260822140412_suspend_wallet_client_surface.sql`
- `20260822141209_harden_notifications_and_obvious_anon_rpc_surface.sql`
- `20260822141401_harden_vendor_catalog_and_messaging_rls.sql`
- `20260822142439_server_authoritative_commerce_checkout_quote.sql`

These files are historical reconstruction only. Restoring them in Git did not execute SQL in production.

### Completed: timestamp drift with equivalent SQL reconstructed

The following logical migrations were proven equivalent to their live production SQL by Git-blob SHA comparison, with differences limited to filename/timestamp and in some cases trailing newline/blank-line formatting. They now also exist under the production versions:

- `20260822091026_temporary_organizer_invites.sql`
- `20260822091918_temporary_organizer_auth_bans.sql`
- `20260822091957_temporary_organizer_regrant.sql`
- `20260822092413_organizer_temporary_identity_only.sql`
- `20260822101133_organizer_event_ticket_approval_integrity.sql`
- `20260822101255_harden_ticket_approval_trigger_permissions.sql`
- `20260822103343_harden_ticket_revision_trigger_context.sql`
- `20260822112957_normalize_ticket_payout_mpamba_method.sql`
- `20260822113203_admin_ticket_event_finance_event_list.sql`
- `20260822151903_use_organization_finance_entitlements.sql`
- `20260822152051_ticket_finance_workspace.sql`
- `20260822153135_ticket_verified_payout_destinations.sql`
- `20260822153634_bind_payout_requests_to_verified_destination.sql`
- `20260822153700_admin_list_payout_destinations.sql`

### Completed: body-different live migrations reconstructed exactly

Several later Git files were not merely timestamp-renamed copies: their SQL bodies differed from what production actually executed. Exact live historical files have now been reconstructed from the Supabase migration ledger and verified by Git blob SHA:

- `20260822145731_restore_public_operational_rls.sql`
- `20260822145812_lock_internal_subscription_functions.sql`
- `20260822150400_restrict_commerce_mutations.sql`
- `20260822150633_prevent_profile_role_escalation.sql`
- `20260822151046_ticket_organization_finance_entitlements.sql`
- `20260822154155_expose_finance_entitlement_status.sql`

Their re-authored Git variants are not treated as historical truth.

### Completed: duplicate active migration version removed

Git previously had two distinct active migrations using version `20260822123500`:

- `20260822123500_organizer_temporary_identity_only.sql`
- `20260822123500_ticket_event_live_revision_workflow.sql`

Production actually executed these logical migrations as:

- `organizer_temporary_identity_only` -> `20260822092413`
- `ticket_event_live_revision_workflow` -> `20260822102422`

The active `supabase/migrations/` directory no longer contains the duplicate `20260822123500` files.

### Completed: unreconciled/pending variants quarantined

Substantively different or intentionally pending variants were moved out of the active push path to:

`supabase/migrations_pending_reconciliation/`

This includes:

- old Git variant `20260822123500_ticket_event_live_revision_workflow.sql`;
- `20260822170000_suspend_wallet_attack_surface.sql`;
- `20260822172500_harden_food_payment_authority.sql`;
- later re-authored variants of operational RLS, internal subscription locking, commerce mutation restrictions, profile role hardening, finance entitlements, and finance-entitlement status.

Quarantine preserves the SQL for review/history while preventing an accidental blanket migration push from treating those files as normal pending migrations.

Food, Marketplace, and Rooms remain frozen/ignored by product decision; their payment/custody work is not part of the ticket/scanner delivery path.

## Remaining known migration-history gap

Exactly one known live 2026-08-22 migration is still missing from the active Git migration history:

`20260822102422_ticket_event_live_revision_workflow.sql`

Important facts:

- production statement size: `51,383` bytes;
- exact production Git-blob SHA-1: `b20f43de723f7f98cd7a34001ff4896da4de7d6b`;
- production statement plus a normal final LF would hash to `e42ff93ba8f9fdf4fa12517e55e31224fbc4a434`;
- neither production blob exists in Git object history;
- the quarantined old Git variant is `49,489` bytes with blob SHA `86b0b447ca5f2fc44c235b095a488426e8e314ed` and must NOT be renamed as though it were the live migration.

The exact production migration must be reconstructed from the Supabase migration ledger and hash-verified before the migration history can be considered structurally repaired.

## Active product invariants during reconciliation

Ticket invariants to preserve:

- Airtel Money remains working;
- TNM Mpamba remains working;
- Bank Transfer remains working;
- Card remains working;
- VAC Payments remains provider-facing ticket payment authority;
- verified callback fulfilment remains ticket issuance authority;
- permanent ticket references remain non-admission references;
- Gate Staff schema is not deployed until migration history is trustworthy.

Other verticals:

- Food: leave in place and ignore/freeze new payment-custody work;
- Marketplace: leave in place and ignore/freeze new payment-custody work;
- Rooms/Landlords: leave in place and ignore/freeze payment-custody work;
- Wallet: remains suspended product-wide.

## Remaining safe sequence

1. Reconstruct exact live `20260822102422_ticket_event_live_revision_workflow.sql` from Supabase's stored migration statement.
2. Verify the resulting Git blob SHA exactly equals the live migration blob SHA.
3. Compare every active Git migration version/name against live `supabase_migrations.schema_migrations` one-for-one.
4. Confirm active migration versions are unique and quarantined files are outside the normal push path.
5. Run a clean local/disposable Supabase replay from migration zero.
6. Compare replayed schema, functions, grants, RLS, triggers, and critical ticket objects to production.
7. Keep `DO NOT DB PUSH` active until that replay/schema comparison passes.
8. After the blocker is cleared, create the Gate Staff/event-scoped scanner schema and RPCs as a new additive migration after the reconciled live head.

## Gate Staff dependency

The event-scoped Gate Staff model is already decided/documented, but implementation intentionally waits for this reconciliation. Gate Staff will require additive schema/RPC changes and must not be layered onto a migration directory whose history does not accurately represent production.
