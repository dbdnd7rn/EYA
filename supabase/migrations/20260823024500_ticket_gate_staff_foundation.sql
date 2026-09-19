begin;

create table if not exists public.ticket_gate_staff_assignments (
  id uuid primary key default extensions.gen_random_uuid(),
  event_id uuid not null references public.ticket_events(id) on delete cascade,
  organization_id uuid not null references public.ticket_organizer_organizations(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  invited_email text not null,
  status text not null default 'invited' check (status in ('invited','accepted','declined','revoked','cancelled')),
  gate_label text,
  invited_by uuid not null references auth.users(id) on delete restrict,
  invited_at timestamptz not null default now(),
  accepted_at timestamptz,
  declined_at timestamptz,
  revoked_at timestamptz,
  revoked_by uuid references auth.users(id) on delete set null,
  revoke_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists ticket_gate_staff_one_open_email_per_event_idx
  on public.ticket_gate_staff_assignments(event_id, lower(invited_email))
  where status in ('invited','accepted');

create unique index if not exists ticket_gate_staff_one_open_user_per_event_idx
  on public.ticket_gate_staff_assignments(event_id, user_id)
  where user_id is not null and status in ('invited','accepted');

create index if not exists ticket_gate_staff_user_idx
  on public.ticket_gate_staff_assignments(user_id, updated_at desc);

create index if not exists ticket_gate_staff_event_idx
  on public.ticket_gate_staff_assignments(event_id, status, updated_at desc);

alter table public.ticket_gate_staff_assignments enable row level security;
revoke all on table public.ticket_gate_staff_assignments from public, anon, authenticated;

alter table public.ticket_checkins
  add column if not exists scanner_assignment_id uuid references public.ticket_gate_staff_assignments(id) on delete set null,
  add column if not exists gate_label text,
  add column if not exists scanner_session_id uuid;

create index if not exists ticket_checkins_scanner_assignment_idx
  on public.ticket_checkins(scanner_assignment_id, created_at desc)
  where scanner_assignment_id is not null;

create index if not exists ticket_checkins_event_created_idx
  on public.ticket_checkins(event_id, created_at desc);

drop trigger if exists trg_ticket_gate_staff_assignments_updated_at on public.ticket_gate_staff_assignments;
create trigger trg_ticket_gate_staff_assignments_updated_at
before update on public.ticket_gate_staff_assignments
for each row execute function public.set_updated_at_column();

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

  select * into v_event from public.ticket_events where id=p_event_id for update;
  if not found then raise exception 'Event not found.'; end if;
  if v_event.organization_id is null then raise exception 'This event is not linked to a Ticket Management organization.'; end if;
  if v_event.starts_at is null then raise exception 'Set the event start date and time before inviting Gate Staff.'; end if;
  if v_event.status in ('cancelled','archived') then raise exception 'Gate Staff cannot be invited for this event.'; end if;

  v_org_id := public.current_ticket_organizer_organization(v_actor);
  if v_org_id is null or v_org_id<>v_event.organization_id then raise exception 'Ticket Management access for this event is required.'; end if;

  select p.id into v_user_id
  from public.profiles p
  where lower(btrim(coalesce(p.email,'')))=v_email
  limit 1;

  if exists (
    select 1 from public.ticket_gate_staff_assignments a
    where a.event_id=p_event_id
      and lower(a.invited_email)=v_email
      and a.status in ('invited','accepted')
  ) then
    raise exception 'This person already has an open Gate Staff assignment for the event.';
  end if;

  insert into public.ticket_gate_staff_assignments(
    event_id, organization_id, user_id, invited_email, gate_label, invited_by
  ) values (
    p_event_id, v_event.organization_id, v_user_id, v_email,
    nullif(btrim(coalesce(p_gate_label,'')),''), v_actor
  ) returning * into v_assignment;

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
  v_email text;
  v_assignment public.ticket_gate_staff_assignments%rowtype;
begin
  if v_user is null then raise exception 'Authentication required.'; end if;

  select lower(btrim(coalesce(p.email,u.email,''))) into v_email
  from auth.users u
  left join public.profiles p on p.id=u.id
  where u.id=v_user;

  select * into v_assignment
  from public.ticket_gate_staff_assignments
  where id=p_assignment_id
  for update;

  if not found then raise exception 'Gate Staff invitation not found.'; end if;
  if v_assignment.status<>'invited' then raise exception 'This Gate Staff invitation is no longer pending.'; end if;
  if lower(v_assignment.invited_email)<>v_email then raise exception 'This Gate Staff invitation is for another EYA account.'; end if;

  update public.ticket_gate_staff_assignments
  set user_id=v_user,status='accepted',accepted_at=clock_timestamp(),updated_at=clock_timestamp()
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
  v_email text;
  v_assignment public.ticket_gate_staff_assignments%rowtype;
begin
  if v_user is null then raise exception 'Authentication required.'; end if;

  select lower(btrim(coalesce(p.email,u.email,''))) into v_email
  from auth.users u
  left join public.profiles p on p.id=u.id
  where u.id=v_user;

  select * into v_assignment
  from public.ticket_gate_staff_assignments
  where id=p_assignment_id
  for update;

  if not found then raise exception 'Gate Staff invitation not found.'; end if;
  if v_assignment.status<>'invited' then raise exception 'This Gate Staff invitation is no longer pending.'; end if;
  if lower(v_assignment.invited_email)<>v_email then raise exception 'This Gate Staff invitation is for another EYA account.'; end if;

  update public.ticket_gate_staff_assignments
  set user_id=v_user,status='declined',declined_at=clock_timestamp(),updated_at=clock_timestamp()
  where id=v_assignment.id;

  return jsonb_build_object('ok',true,'assignment_id',v_assignment.id,'status','declined');
end;
$$;

create or replace function public.revoke_ticket_gate_staff_assignment(
  p_assignment_id uuid,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_assignment public.ticket_gate_staff_assignments%rowtype;
  v_org_id uuid;
begin
  if v_actor is null then raise exception 'Authentication required.'; end if;

  select * into v_assignment
  from public.ticket_gate_staff_assignments
  where id=p_assignment_id
  for update;

  if not found then raise exception 'Gate Staff assignment not found.'; end if;

  v_org_id := public.current_ticket_organizer_organization(v_actor);
  if v_org_id is null or v_org_id<>v_assignment.organization_id then raise exception 'Ticket Management access for this event is required.'; end if;
  if v_assignment.status not in ('invited','accepted') then raise exception 'This Gate Staff assignment is already closed.'; end if;

  update public.ticket_gate_staff_assignments
  set status='revoked',revoked_at=clock_timestamp(),revoked_by=v_actor,
      revoke_note=nullif(btrim(coalesce(p_note,'')),''),updated_at=clock_timestamp()
  where id=v_assignment.id;

  return jsonb_build_object('ok',true,'assignment_id',v_assignment.id,'status','revoked');
end;
$$;

create or replace function public.get_my_gate_staff_assignments()
returns jsonb
language sql
security definer
set search_path = public, auth, pg_temp
stable
as $$
  with me as (
    select u.id,
           lower(btrim(coalesce(p.email,u.email,''))) as email
    from auth.users u
    left join public.profiles p on p.id=u.id
    where u.id=auth.uid()
  ), rows as (
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
    join me on (a.user_id=me.id or (a.user_id is null and lower(a.invited_email)=me.email))
  )
  select coalesce(jsonb_agg(to_jsonb(rows) order by starts_at asc),'[]'::jsonb) from rows;
$$;

create or replace function public.get_my_ticket_event_gate_staff(p_event_id uuid)
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
  v_result jsonb;
begin
  if v_actor is null then raise exception 'Authentication required.'; end if;
  select * into v_event from public.ticket_events where id=p_event_id;
  if not found then raise exception 'Event not found.'; end if;

  v_org_id := public.current_ticket_organizer_organization(v_actor);
  if v_org_id is null or v_org_id<>v_event.organization_id then raise exception 'Ticket Management access for this event is required.'; end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',a.id,
    'user_id',a.user_id,
    'invited_email',a.invited_email,
    'staff_name',p.full_name,
    'assignment_status',a.status,
    'effective_status',case
      when a.status in ('declined','revoked','cancelled') then a.status
      when a.status='invited' then 'invited'
      when v_event.status='cancelled' then 'cancelled'
      when now()>coalesce(v_event.ends_at,v_event.starts_at+interval '6 hours')+interval '6 hours' then 'expired'
      when now()>=v_event.starts_at-interval '48 hours' and v_event.status='published' and v_event.approved_version_id is not null then 'active'
      else 'scheduled'
    end,
    'gate_label',a.gate_label,
    'invited_at',a.invited_at,
    'accepted_at',a.accepted_at,
    'scanner_opens_at',v_event.starts_at-interval '48 hours',
    'scanner_expires_at',coalesce(v_event.ends_at,v_event.starts_at+interval '6 hours')+interval '6 hours',
    'scan_count',coalesce(s.scan_count,0),
    'last_scan_at',s.last_scan_at
  ) order by a.created_at asc),'[]'::jsonb)
  into v_result
  from public.ticket_gate_staff_assignments a
  left join public.profiles p on p.id=a.user_id
  left join lateral (
    select count(*)::bigint as scan_count,max(c.created_at) as last_scan_at
    from public.ticket_checkins c
    where c.scanner_assignment_id=a.id
  ) s on true
  where a.event_id=p_event_id;

  return jsonb_build_object(
    'event_id',v_event.id,
    'event_title',v_event.title,
    'scanner_opens_at',v_event.starts_at-interval '48 hours',
    'scanner_expires_at',coalesce(v_event.ends_at,v_event.starts_at+interval '6 hours')+interval '6 hours',
    'staff',coalesce(v_result,'[]'::jsonb)
  );
end;
$$;

create or replace function public.can_scan_ticket_event(p_event_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, auth, pg_temp
stable
as $$
declare
  v_user uuid := auth.uid();
  v_event public.ticket_events%rowtype;
begin
  if v_user is null then return false; end if;
  if public.is_admin() then return true; end if;

  select * into v_event from public.ticket_events where id=p_event_id;
  if not found or v_event.starts_at is null then return false; end if;
  if v_event.status<>'published' then return false; end if;
  if v_event.organizer_id is not null and v_event.approved_version_id is null then return false; end if;
  if now()<v_event.starts_at-interval '48 hours' then return false; end if;
  if now()>coalesce(v_event.ends_at,v_event.starts_at+interval '6 hours')+interval '6 hours' then return false; end if;

  return exists (
    select 1
    from public.ticket_gate_staff_assignments a
    where a.event_id=p_event_id
      and a.user_id=v_user
      and a.status='accepted'
  );
end;
$$;

revoke all on function public.invite_ticket_gate_staff(uuid,text,text) from public, anon;
revoke all on function public.accept_ticket_gate_staff_invite(uuid) from public, anon;
revoke all on function public.decline_ticket_gate_staff_invite(uuid) from public, anon;
revoke all on function public.revoke_ticket_gate_staff_assignment(uuid,text) from public, anon;
revoke all on function public.get_my_gate_staff_assignments() from public, anon;
revoke all on function public.get_my_ticket_event_gate_staff(uuid) from public, anon;
revoke all on function public.can_scan_ticket_event(uuid) from public, anon;

grant execute on function public.invite_ticket_gate_staff(uuid,text,text) to authenticated;
grant execute on function public.accept_ticket_gate_staff_invite(uuid) to authenticated;
grant execute on function public.decline_ticket_gate_staff_invite(uuid) to authenticated;
grant execute on function public.revoke_ticket_gate_staff_assignment(uuid,text) to authenticated;
grant execute on function public.get_my_gate_staff_assignments() to authenticated;
grant execute on function public.get_my_ticket_event_gate_staff(uuid) to authenticated;
grant execute on function public.can_scan_ticket_event(uuid) to authenticated;

commit;
