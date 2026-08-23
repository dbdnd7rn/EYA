begin;

create or replace function public.get_my_ticket_event_checkin_activity(
  p_event_id uuid,
  p_limit integer default 200
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
stable
as $$
declare
  v_actor uuid := auth.uid();
  v_event public.ticket_events%rowtype;
  v_org_id uuid;
  v_limit integer := greatest(1,least(coalesce(p_limit,200),500));
  v_rows jsonb;
  v_tickets_issued bigint;
  v_checked_in bigint;
  v_last_15 bigint;
  v_active_scanners bigint;
begin
  if v_actor is null then raise exception 'Authentication required.'; end if;

  select * into v_event
  from public.ticket_events
  where id=p_event_id;

  if not found then raise exception 'Event not found.'; end if;

  v_org_id := public.current_ticket_organizer_organization(v_actor);
  if v_org_id is null or v_org_id<>v_event.organization_id then
    raise exception 'Ticket Management access for this event is required.';
  end if;

  select count(*)::bigint,
         count(*) filter (where checked_in_at is not null)::bigint
  into v_tickets_issued,v_checked_in
  from public.issued_tickets
  where event_id=p_event_id
    and status in ('active','used');

  select count(*)::bigint
  into v_last_15
  from public.ticket_checkins
  where event_id=p_event_id
    and created_at>=clock_timestamp()-interval '15 minutes';

  select count(*)::bigint
  into v_active_scanners
  from public.ticket_gate_staff_assignments a
  where a.event_id=p_event_id
    and a.status='accepted'
    and v_event.status='published'
    and v_event.approved_version_id is not null
    and v_event.starts_at is not null
    and clock_timestamp()>=v_event.starts_at-interval '48 hours'
    and clock_timestamp()<=coalesce(v_event.ends_at,v_event.starts_at+interval '6 hours')+interval '6 hours';

  select coalesce(jsonb_agg(row_data order by row_data->>'checked_in_at' desc),'[]'::jsonb)
  into v_rows
  from (
    select jsonb_build_object(
      'checkin_id',c.id,
      'checked_in_at',c.created_at,
      'ticket_id',it.id,
      'ticket_reference',it.ticket_code,
      'ticket_type',tt.name,
      'scanner_user_id',c.checked_in_by,
      'scanner_name',coalesce(nullif(btrim(sp.full_name),''),'EYA staff'),
      'scanner_assignment_id',c.scanner_assignment_id,
      'gate_label',c.gate_label,
      'method',c.method,
      'credential_kind',c.metadata->>'credential_kind',
      'scanner_access_kind',coalesce(c.metadata->>'scanner_access_kind',case when c.scanner_assignment_id is null then 'admin' else 'gate_staff' end)
    ) as row_data
    from public.ticket_checkins c
    join public.issued_tickets it on it.id=c.issued_ticket_id
    left join public.ticket_tiers tt on tt.id=it.tier_id
    left join public.profiles sp on sp.id=c.checked_in_by
    where c.event_id=p_event_id
    order by c.created_at desc
    limit v_limit
  ) q;

  return jsonb_build_object(
    'event',jsonb_build_object(
      'id',v_event.id,
      'title',v_event.title,
      'starts_at',v_event.starts_at,
      'ends_at',v_event.ends_at,
      'venue',v_event.venue,
      'city',v_event.city
    ),
    'summary',jsonb_build_object(
      'tickets_issued',coalesce(v_tickets_issued,0),
      'checked_in',coalesce(v_checked_in,0),
      'remaining_to_check_in',greatest(0,coalesce(v_tickets_issued,0)-coalesce(v_checked_in,0)),
      'checkins_last_15_minutes',coalesce(v_last_15,0),
      'active_gate_staff',coalesce(v_active_scanners,0)
    ),
    'activity',coalesce(v_rows,'[]'::jsonb)
  );
end;
$$;

revoke all on function public.get_my_ticket_event_checkin_activity(uuid,integer) from public, anon;
grant execute on function public.get_my_ticket_event_checkin_activity(uuid,integer) to authenticated;

commit;
