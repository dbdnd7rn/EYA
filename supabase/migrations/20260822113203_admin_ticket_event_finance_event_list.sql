create or replace function public.admin_list_ticket_event_finance_events()
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_admin uuid := auth.uid();
  v_result jsonb;
begin
  if v_admin is null or not public.is_admin() then raise exception 'Admin access required.'; end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'event_id', e.id,
    'event_title', e.title,
    'event_status', e.status,
    'starts_at', e.starts_at,
    'ends_at', e.ends_at,
    'organizer_id', e.organizer_id,
    'organizer_name', p.full_name,
    'organizer_email', p.email,
    'finance', public.ticket_event_finance_snapshot(e.id)
  ) order by coalesce(e.ends_at,e.starts_at) asc nulls last), '[]'::jsonb)
  into v_result
  from public.ticket_events e
  left join public.profiles p on p.id=e.organizer_id
  where e.organizer_id is not null
    and e.approved_version_id is not null
    and e.status in ('published','paused','archived','cancelled');

  return v_result;
end;
$$;

revoke all on function public.admin_list_ticket_event_finance_events() from public, anon;
grant execute on function public.admin_list_ticket_event_finance_events() to authenticated;
