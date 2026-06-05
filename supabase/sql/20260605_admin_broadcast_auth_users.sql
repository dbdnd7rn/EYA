-- Make admin "all users" broadcasts target Supabase Auth accounts, not only
-- accounts that already have a public.profiles row.

begin;

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
    target.user_id,
    trim(p_title),
    trim(p_message),
    notification_type,
    normalized_priority,
    jsonb_build_object('audienceRole', audience, 'broadcast', true),
    false
  from (
    select u.id as user_id
    from auth.users u
    left join public.profiles p on p.id = u.id
    where
      audience = 'all'
      or (audience = 'student' and coalesce(p.role, 'student') = 'student')
      or p.role = audience
  ) target;

  get diagnostics inserted_count = row_count;

  return jsonb_build_object(
    'status', 'success',
    'sent_to', inserted_count,
    'audience_role', audience,
    'recipient_source', case when audience in ('all', 'student') then 'auth_users' else 'profiles' end
  );
end;
$$;

grant execute on function public.admin_broadcast_notification(text, text, text, text, text) to authenticated;

commit;
