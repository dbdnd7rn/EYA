-- Repair migration for workspace admission applications.
-- Safe to apply after older deployments where 20260427_role_applications.sql
-- was missed, leaving the mobile app unable to submit food-provider requests.

begin;

create extension if not exists pgcrypto;

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

grant select, insert, update on public.role_applications to authenticated;
grant all on public.role_applications to service_role;

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

create or replace function public.role_application_label(application_kind text, target_role text)
returns text
language sql
stable
as $$
  select case
    when application_kind = 'restaurant' then 'Restaurant'
    when application_kind = 'seller' then 'Seller'
    when application_kind = 'delivery' then 'Delivery Agent'
    when target_role = 'landlord' then 'Landlord'
    else 'Workspace'
  end;
$$;

create or replace function public.notify_role_application_submitted()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  role_label text;
  applicant_label text;
begin
  if to_regclass('public.notifications') is null then
    return new;
  end if;

  role_label := public.role_application_label(new.application_kind, new.target_role);
  applicant_label := coalesce(nullif(new.applicant_name, ''), nullif(new.applicant_email, ''), 'A user');

  insert into public.notifications (user_id, title, message, type, priority, data, is_read)
  select
    p.id,
    'New ' || role_label || ' admission',
    applicant_label || ' submitted a ' || lower(role_label) || ' role application.',
    'role_application_submitted',
    'important',
    jsonb_build_object(
      'applicationId', new.id,
      'applicantId', new.user_id,
      'targetRole', new.target_role,
      'applicationKind', new.application_kind
    ),
    false
  from public.profiles p
  where p.role = 'admin';

  return new;
end;
$$;

create or replace function public.notify_role_application_reviewed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  role_label text;
  approved boolean;
begin
  if to_regclass('public.notifications') is null then
    return new;
  end if;

  if new.status not in ('approved', 'declined') or old.status = new.status then
    return new;
  end if;

  role_label := public.role_application_label(new.application_kind, new.target_role);
  approved := new.status = 'approved';

  insert into public.notifications (user_id, title, message, type, priority, data, is_read)
  values (
    new.user_id,
    role_label || case when approved then ' admission approved' else ' admission declined' end,
    case
      when approved then 'Your ' || lower(role_label) || ' admission has been approved. You can now switch into that workspace.'
      else 'Your ' || lower(role_label) || ' admission was declined.' || case when coalesce(new.admin_note, '') <> '' then ' ' || new.admin_note else '' end
    end,
    case when approved then 'role_application_approved' else 'role_application_declined' end,
    'important',
    jsonb_build_object(
      'applicationId', new.id,
      'targetRole', new.target_role,
      'applicationKind', new.application_kind,
      'status', new.status
    ),
    false
  );

  return new;
end;
$$;

drop trigger if exists notify_role_application_submitted on public.role_applications;
create trigger notify_role_application_submitted
after insert on public.role_applications
for each row
when (new.status = 'pending')
execute function public.notify_role_application_submitted();

drop trigger if exists notify_role_application_reviewed on public.role_applications;
create trigger notify_role_application_reviewed
after update of status on public.role_applications
for each row
execute function public.notify_role_application_reviewed();

commit;
