-- Wallet and wallet-backed payments are suspended product-wide.
-- Preserve historical rows for audit/reconciliation while removing all client
-- access and executable checkout authority. service_role remains available for
-- controlled recovery work only.

revoke all on table public.wallet_accounts from anon, authenticated;
revoke all on table public.wallet_activities from anon, authenticated;

drop policy if exists "wallet_accounts_select_own" on public.wallet_accounts;
drop policy if exists "wallet_accounts_insert_own" on public.wallet_accounts;
drop policy if exists "wallet_accounts_update_own" on public.wallet_accounts;
drop policy if exists "wallet_activities_select_own" on public.wallet_activities;
drop policy if exists "wallet_activities_insert_own" on public.wallet_activities;

revoke all on function public.wallet_checkout_campus_market(uuid, text, text, text, jsonb)
  from public, anon, authenticated;

alter table public.wallet_accounts enable row level security;
alter table public.wallet_activities enable row level security;

comment on table public.wallet_accounts is
  'SUSPENDED: retained for historical audit only; no client access.';
comment on table public.wallet_activities is
  'SUSPENDED: retained for historical audit only; no client access.';
