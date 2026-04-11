create extension if not exists pgcrypto;

create or replace function public.is_admin()
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role = 'admin'
  );
$$;

create table if not exists public.app_runtime_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  event_type text not null,
  level text not null default 'info' check (level in ('info', 'warn', 'error')),
  message text not null,
  context jsonb not null default '{}'::jsonb,
  app_env text,
  created_at timestamptz not null default now()
);

create index if not exists idx_app_runtime_events_user_id on public.app_runtime_events(user_id);
create index if not exists idx_app_runtime_events_created_at on public.app_runtime_events(created_at desc);

alter table public.app_runtime_events enable row level security;

drop policy if exists "runtime_events_insert_client" on public.app_runtime_events;
create policy "runtime_events_insert_client" on public.app_runtime_events
for insert to anon, authenticated
with check (user_id is null or user_id = auth.uid());

drop policy if exists "runtime_events_select_own_or_admin" on public.app_runtime_events;
create policy "runtime_events_select_own_or_admin" on public.app_runtime_events
for select to authenticated
using (user_id = auth.uid() or public.is_admin());

create table if not exists public.push_notification_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  device_id text not null,
  push_token text not null,
  platform text not null,
  is_active boolean not null default true,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, device_id)
);

create index if not exists idx_push_notification_tokens_user_id on public.push_notification_tokens(user_id);

alter table public.push_notification_tokens enable row level security;

drop policy if exists "push_tokens_select_own_or_admin" on public.push_notification_tokens;
create policy "push_tokens_select_own_or_admin" on public.push_notification_tokens
for select to authenticated
using (user_id = auth.uid() or public.is_admin());

drop policy if exists "push_tokens_insert_own" on public.push_notification_tokens;
create policy "push_tokens_insert_own" on public.push_notification_tokens
for insert to authenticated
with check (user_id = auth.uid());

drop policy if exists "push_tokens_update_own" on public.push_notification_tokens;
create policy "push_tokens_update_own" on public.push_notification_tokens
for update to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

create table if not exists public.trust_safety_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references auth.users(id) on delete cascade,
  subject_type text not null,
  subject_id uuid,
  category text not null,
  details text not null,
  related_enquiry_id uuid,
  related_order_id uuid,
  status text not null default 'open' check (status in ('open', 'in_review', 'resolved', 'dismissed')),
  admin_notes text,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_trust_safety_reports_reporter_id on public.trust_safety_reports(reporter_id);
create index if not exists idx_trust_safety_reports_status on public.trust_safety_reports(status);
create index if not exists idx_trust_safety_reports_created_at on public.trust_safety_reports(created_at desc);

alter table public.trust_safety_reports enable row level security;

drop policy if exists "trust_reports_insert_own" on public.trust_safety_reports;
create policy "trust_reports_insert_own" on public.trust_safety_reports
for insert to authenticated
with check (reporter_id = auth.uid());

drop policy if exists "trust_reports_select_own_or_admin" on public.trust_safety_reports;
create policy "trust_reports_select_own_or_admin" on public.trust_safety_reports
for select to authenticated
using (reporter_id = auth.uid() or public.is_admin());

drop policy if exists "trust_reports_update_admin" on public.trust_safety_reports;
create policy "trust_reports_update_admin" on public.trust_safety_reports
for update to authenticated
using (public.is_admin())
with check (public.is_admin());

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_push_notification_tokens_updated_at on public.push_notification_tokens;
create trigger trg_push_notification_tokens_updated_at
before update on public.push_notification_tokens
for each row execute function public.set_updated_at();

drop trigger if exists trg_trust_safety_reports_updated_at on public.trust_safety_reports;
create trigger trg_trust_safety_reports_updated_at
before update on public.trust_safety_reports
for each row execute function public.set_updated_at();
