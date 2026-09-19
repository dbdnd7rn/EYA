begin;

-- Gate Staff invitations are identity-sensitive. Bind them to an existing
-- Supabase Auth account at invite time rather than trusting mutable profile
-- email data or allowing a future account to claim an email-only invitation.
create or replace function public.invite_ticket_gate_staff(
  p_event_id uuid,
  p_email text,
  p_gate_label text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_email text := lower(btrim(coalesce(p_email,'')));
  v_event public.ticket_events%rowtype;
  v_org_id uuid;
  v_user_id uuid;
  v_assignment public.ticket_gate_staff_assignments%rowtype;
begin
  if v_actor is null then raise exception 'Authentication required.'; end if;
  if v_email='' or position('@' in v_email)<2 then raise exception 'Enter a valid EYA account email.'; end if;

  select * into v_event
  from public.ticket_events
  where id=p_event_id
  for update;

  if not found then raise exception 'Event not found.'; end if;
  if v_event.organization_id is null then raise exception 'This event is not linked to a Ticket Management organization.'; end if;
  if v_event.starts_at is null then raise exception 'Set the event start date and time before inviting Gate Staff.'; end if;
  if v_event.status in ('cancelled','archived') then raise exception 'Gate Staff cannot be invited for this event.'; end if;

  v_org_id := public.current_ticket_organizer_organization(v_actor);
  if v_org_id is null or v_org_id<>v_event.organization_id then
    raise exception 'Ticket Management access for this event is required.';
  end if;

  select u.id into v_user_id
  from auth.users u
  where lower(btrim(coalesce(u.email,'')))=v_email
    and u.email_confirmed_at is not null
  limit 1;

  if v_user_id is null then
    raise exception 'No verified EYA account was found for this email. Ask the person to create and verify their EYA account first.';
  end if;

  if exists (
    select 1
    from public.ticket_gate_staff_assignments a
    where a.event_id=p_event_id
      and a.user_id=v_user_id
      and a.status in ('invited','accepted')
  ) then
    raise exception 'This person already has an open Gate Staff assignment for the event.';
  end if;

  insert into public.ticket_gate_staff_assignments(
    event_id, organization_id, user_id, invited_email, gate_label, invited_by
  ) values (
    p_event_id,
    v_event.organization_id,
    v_user_id,
    v_email,
    nullif(btrim(coalesce(p_gate_label,'')),''),
    v_actor
  )
  returning * into v_assignment;

  return jsonb_build_object(
    'ok',true,
    'assignment_id',v_assignment.id,
    'status',v_assignment.status,
    'event_id',v_assignment.event_id,
    'invited_email',v_assignment.invited_email,
    'gate_label',v_assignment.gate_label,
    'scanner_opens_at',v_event.starts_at-interval '48 hours',
    'scanner_expires_at',coalesce(v_event.ends_at,v_event.starts_at+interval '6 hours')+interval '6 hours'
  );
end;
$$;

create or replace function public.accept_ticket_gate_staff_invite(p_assignment_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_assignment public.ticket_gate_staff_assignments%rowtype;
begin
  if v_user is null then raise exception 'Authentication required.'; end if;

  select * into v_assignment
  from public.ticket_gate_staff_assignments
  where id=p_assignment_id
  for update;

  if not found then raise exception 'Gate Staff invitation not found.'; end if;
  if v_assignment.status<>'invited' then raise exception 'This Gate Staff invitation is no longer pending.'; end if;
  if v_assignment.user_id is distinct from v_user then
    raise exception 'This Gate Staff invitation is for another EYA account.';
  end if;

  update public.ticket_gate_staff_assignments
  set status='accepted',accepted_at=clock_timestamp(),updated_at=clock_timestamp()
  where id=v_assignment.id;

  return jsonb_build_object('ok',true,'assignment_id',v_assignment.id,'status','accepted');
end;
$$;

create or replace function public.decline_ticket_gate_staff_invite(p_assignment_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_assignment public.ticket_gate_staff_assignments%rowtype;
begin
  if v_user is null then raise exception 'Authentication required.'; end if;

  select * into v_assignment
  from public.ticket_gate_staff_assignments
  where id=p_assignment_id
  for update;

  if not found then raise exception 'Gate Staff invitation not found.'; end if;
  if v_assignment.status<>'invited' then raise exception 'This Gate Staff invitation is no longer pending.'; end if;
  if v_assignment.user_id is distinct from v_user then
    raise exception 'This Gate Staff invitation is for another EYA account.';
  end if;

  update public.ticket_gate_staff_assignments
  set status='declined',declined_at=clock_timestamp(),updated_at=clock_timestamp()
  where id=v_assignment.id;

  return jsonb_build_object('ok',true,'assignment_id',v_assignment.id,'status','declined');
end;
$$;

create or replace function public.get_my_gate_staff_assignments()
returns jsonb
language sql
security definer
set search_path = public, auth, pg_temp
stable
as $$
  select coalesce(jsonb_agg(to_jsonb(rows) order by starts_at asc),'[]'::jsonb)
  from (
    select
      a.id,
      a.event_id,
      a.organization_id,
      a.status as assignment_status,
      a.gate_label,
      a.invited_email,
      a.invited_at,
      a.accepted_at,
      e.title as event_title,
      e.venue,
      e.city,
      e.starts_at,
      e.ends_at,
      e.status as event_status,
      e.starts_at-interval '48 hours' as scanner_opens_at,
      coalesce(e.ends_at,e.starts_at+interval '6 hours')+interval '6 hours' as scanner_expires_at,
      case
        when a.status in ('declined','revoked','cancelled') then a.status
        when a.status='invited' then 'invited'
        when e.status='cancelled' then 'cancelled'
        when now()>coalesce(e.ends_at,e.starts_at+interval '6 hours')+interval '6 hours' then 'expired'
        when now()>=e.starts_at-interval '48 hours'
             and e.status='published'
             and (e.organizer_id is null or e.approved_version_id is not null) then 'active'
        else 'scheduled'
      end as effective_status,
      (
        a.status='accepted'
        and e.status='published'
        and (e.organizer_id is null or e.approved_version_id is not null)
        and now()>=e.starts_at-interval '48 hours'
        and now()<=coalesce(e.ends_at,e.starts_at+interval '6 hours')+interval '6 hours'
      ) as scan_enabled
    from public.ticket_gate_staff_assignments a
    join public.ticket_events e on e.id=a.event_id
    where a.user_id=auth.uid()
  ) rows;
$$;

revoke all on function public.invite_ticket_gate_staff(uuid,text,text) from public, anon;
revoke all on function public.accept_ticket_gate_staff_invite(uuid) from public, anon;
revoke all on function public.decline_ticket_gate_staff_invite(uuid) from public, anon;
revoke all on function public.get_my_gate_staff_assignments() from public, anon;

grant execute on function public.invite_ticket_gate_staff(uuid,text,text) to authenticated;
grant execute on function public.accept_ticket_gate_staff_invite(uuid) to authenticated;
grant execute on function public.decline_ticket_gate_staff_invite(uuid) to authenticated;
grant execute on function public.get_my_gate_staff_assignments() to authenticated;

commit;
