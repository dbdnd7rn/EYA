-- Wallet sync tables for student app.
-- Stores balance/points and wallet activity per authenticated user.

create extension if not exists pgcrypto;

create table if not exists public.wallet_accounts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  balance_mwk integer not null default 0 check (balance_mwk >= 0),
  points integer not null default 0 check (points >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.wallet_activities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  label text not null,
  amount_mwk integer not null,
  type text not null check (type in ('topup', 'payment', 'reward')),
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_wallet_activities_user_created_at
  on public.wallet_activities(user_id, created_at desc);

create or replace function public.wallet_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_wallet_accounts_updated_at on public.wallet_accounts;
create trigger trg_wallet_accounts_updated_at
before update on public.wallet_accounts
for each row execute function public.wallet_set_updated_at();

alter table public.wallet_accounts enable row level security;
alter table public.wallet_activities enable row level security;

drop policy if exists "wallet_accounts_select_own" on public.wallet_accounts;
create policy "wallet_accounts_select_own"
on public.wallet_accounts
for select to authenticated
using (auth.uid() = user_id);

drop policy if exists "wallet_accounts_insert_own" on public.wallet_accounts;
create policy "wallet_accounts_insert_own"
on public.wallet_accounts
for insert to authenticated
with check (auth.uid() = user_id);

drop policy if exists "wallet_accounts_update_own" on public.wallet_accounts;
create policy "wallet_accounts_update_own"
on public.wallet_accounts
for update to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "wallet_activities_select_own" on public.wallet_activities;
create policy "wallet_activities_select_own"
on public.wallet_activities
for select to authenticated
using (auth.uid() = user_id);

drop policy if exists "wallet_activities_insert_own" on public.wallet_activities;
create policy "wallet_activities_insert_own"
on public.wallet_activities
for insert to authenticated
with check (auth.uid() = user_id);

grant select, insert, update on public.wallet_accounts to authenticated;
grant select, insert on public.wallet_activities to authenticated;
grant all on public.wallet_accounts, public.wallet_activities to service_role;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'wallet_accounts'
  ) then
    alter publication supabase_realtime add table public.wallet_accounts;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'wallet_activities'
  ) then
    alter publication supabase_realtime add table public.wallet_activities;
  end if;
end $$;
