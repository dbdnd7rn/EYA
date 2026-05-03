-- Role applications power the workspace request flow.
-- Users submit details, admins approve/decline, and approved rows unlock the extra workspace.

alter table if exists public.profiles drop constraint if exists profiles_role_check;
alter table if exists public.profiles
  add constraint profiles_role_check check (role in ('student', 'vendor', 'landlord', 'agent', 'admin'));

create table if not exists public.role_applications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  target_role text not null check (target_role in ('vendor', 'landlord', 'agent')),
  application_kind text not null check (application_kind in ('landlord', 'restaurant', 'seller', 'delivery')),
  status text not null default 'pending' check (status in ('pending', 'approved', 'declined')),
  payload jsonb not null default '{}'::jsonb,
  applicant_name text,
  applicant_email text,
  applicant_phone text,
  admin_note text,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists role_applications_user_idx on public.role_applications(user_id);
create index if not exists role_applications_status_idx on public.role_applications(status);
create index if not exists role_applications_target_role_idx on public.role_applications(target_role);

create unique index if not exists role_applications_one_pending_per_kind_idx
  on public.role_applications(user_id, target_role, application_kind)
  where status = 'pending';

create or replace function public.touch_role_applications_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists touch_role_applications_updated_at on public.role_applications;
create trigger touch_role_applications_updated_at
before update on public.role_applications
for each row
execute function public.touch_role_applications_updated_at();

alter table public.role_applications enable row level security;

drop policy if exists "role_applications_select_own_or_admin" on public.role_applications;
create policy "role_applications_select_own_or_admin" on public.role_applications
for select to authenticated
using (user_id = auth.uid() or public.is_admin());

drop policy if exists "role_applications_insert_own" on public.role_applications;
create policy "role_applications_insert_own" on public.role_applications
for insert to authenticated
with check (user_id = auth.uid() and status = 'pending');

drop policy if exists "role_applications_update_admin" on public.role_applications;
create policy "role_applications_update_admin" on public.role_applications
for update to authenticated
using (public.is_admin())
with check (public.is_admin());
