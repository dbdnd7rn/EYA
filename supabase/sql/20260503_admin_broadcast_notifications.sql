-- Admin broadcast fallback used by the mobile app when the backend broadcast
-- endpoint is not yet deployed. It inserts in-app notifications for the chosen
-- audience from a security-definer function guarded by public.is_admin().

begin;

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text,
  message text,
  type text,
  priority text not null default 'normal',
  data jsonb not null default '{}'::jsonb,
  is_read boolean not null default false,
  read_at timestamptz,
  pushed_at timestamptz,
  created_at timestamptz not null default now()
);

alter table if exists public.notifications
  add column if not exists data jsonb not null default '{}'::jsonb;

alter table if exists public.notifications
  add column if not exists priority text not null default 'normal';

alter table if exists public.notifications
  add column if not exists read_at timestamptz;

alter table if exists public.notifications
  add column if not exists pushed_at timestamptz;

create index if not exists idx_notifications_user_unread_created_at
  on public.notifications(user_id, is_read, created_at desc);

create index if not exists idx_notifications_user_priority_created_at
  on public.notifications(user_id, priority, created_at desc);

alter table public.notifications enable row level security;

drop policy if exists "notifications_select_own_or_admin" on public.notifications;
create policy "notifications_select_own_or_admin" on public.notifications
for select to authenticated
using (user_id = auth.uid() or public.is_admin());

drop policy if exists "notifications_insert_own_or_admin" on public.notifications;
create policy "notifications_insert_own_or_admin" on public.notifications
for insert to authenticated
with check (user_id = auth.uid() or public.is_admin());

drop policy if exists "notifications_update_own_or_admin" on public.notifications;
create policy "notifications_update_own_or_admin" on public.notifications
for update to authenticated
using (user_id = auth.uid() or public.is_admin())
with check (user_id = auth.uid() or public.is_admin());

grant select, insert, update on public.notifications to authenticated;
grant all on public.notifications to service_role;

create or replace function public.admin_broadcast_notification(
  p_title text,
  p_message text,
  p_audience_role text default 'all',
  p_priority text default 'normal',
  p_type text default 'admin_notice'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  audience text := lower(coalesce(nullif(trim(p_audience_role), ''), 'all'));
  normalized_priority text := case when lower(coalesce(p_priority, 'normal')) = 'important' then 'important' else 'normal' end;
  notification_type text := coalesce(nullif(trim(p_type), ''), 'admin_notice');
  inserted_count integer := 0;
begin
  if not public.is_admin() then
    raise exception 'Admin access required.';
  end if;

  if coalesce(trim(p_title), '') = '' then
    raise exception 'Notification title is required.';
  end if;

  if coalesce(trim(p_message), '') = '' then
    raise exception 'Notification message is required.';
  end if;

  if audience not in ('all', 'student', 'landlord', 'agent', 'vendor', 'admin') then
    raise exception 'Invalid notification audience.';
  end if;

  insert into public.notifications (user_id, title, message, type, priority, data, is_read)
  select
    p.id,
    trim(p_title),
    trim(p_message),
    notification_type,
    normalized_priority,
    jsonb_build_object('audienceRole', audience, 'broadcast', true),
    false
  from public.profiles p
  where audience = 'all' or p.role = audience;

  get diagnostics inserted_count = row_count;

  return jsonb_build_object(
    'status', 'success',
    'sent_to', inserted_count,
    'audience_role', audience
  );
end;
$$;

grant execute on function public.admin_broadcast_notification(text, text, text, text, text) to authenticated;

commit;
