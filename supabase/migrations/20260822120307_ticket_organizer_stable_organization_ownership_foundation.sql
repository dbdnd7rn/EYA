create table if not exists public.ticket_organizer_organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  status text not null default 'active' check (status in ('active','suspended','closed')),
  created_by uuid not null references auth.users(id) on delete restrict,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ticket_organizer_organizations_status_idx
  on public.ticket_organizer_organizations(status, created_at desc);

alter table public.ticket_organizer_organizations enable row level security;
revoke all on public.ticket_organizer_organizations from public, anon, authenticated;
grant all on public.ticket_organizer_organizations to service_role;

alter table public.ticket_organizer_invites
  add column if not exists organization_id uuid references public.ticket_organizer_organizations(id) on delete restrict;
alter table public.ticket_organizer_access_grants
  add column if not exists organization_id uuid references public.ticket_organizer_organizations(id) on delete restrict;
alter table public.ticket_events
  add column if not exists organization_id uuid references public.ticket_organizer_organizations(id) on delete restrict;
alter table public.ticket_event_finance_controls
  add column if not exists organization_id uuid references public.ticket_organizer_organizations(id) on delete restrict;
alter table public.ticket_event_payout_requests
  add column if not exists organization_id uuid references public.ticket_organizer_organizations(id) on delete restrict;

do $$
begin
  if exists (select 1 from public.ticket_organizer_invites where organization_id is null)
     or exists (select 1 from public.ticket_organizer_access_grants where organization_id is null)
     or exists (select 1 from public.ticket_event_finance_controls where organization_id is null)
     or exists (select 1 from public.ticket_event_payout_requests where organization_id is null) then
    raise exception 'Organizer ownership foundation requires zero legacy organizer/finance rows before organization_id becomes required.';
  end if;
end;
$$;

alter table public.ticket_organizer_invites alter column organization_id set not null;
alter table public.ticket_organizer_access_grants alter column organization_id set not null;
alter table public.ticket_event_finance_controls alter column organization_id set not null;
alter table public.ticket_event_payout_requests alter column organization_id set not null;

create index if not exists ticket_organizer_invites_org_idx
  on public.ticket_organizer_invites(organization_id, created_at desc);
create index if not exists ticket_organizer_access_grants_org_idx
  on public.ticket_organizer_access_grants(organization_id, status, expires_at desc);
create index if not exists ticket_events_org_idx
  on public.ticket_events(organization_id, status, updated_at desc)
  where organization_id is not null;
create index if not exists ticket_event_finance_controls_org_idx
  on public.ticket_event_finance_controls(organization_id, status, updated_at desc);
create index if not exists ticket_event_payout_requests_org_idx
  on public.ticket_event_payout_requests(organization_id, status, requested_at desc);

alter table public.ticket_events drop constraint if exists ticket_events_organizer_org_pair_check;
alter table public.ticket_events add constraint ticket_events_organizer_org_pair_check
  check (
    (organizer_id is null and organization_id is null)
    or (organizer_id is not null and organization_id is not null)
  );

create or replace function public.current_ticket_organizer_grant(p_user_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public, auth, pg_temp
as $$
  select g.id
  from public.ticket_organizer_access_grants g
  join public.ticket_organizer_organizations o on o.id = g.organization_id
  join auth.users u on u.id = g.user_id
  where g.user_id = p_user_id
    and coalesce(u.raw_app_meta_data->>'eya_account_type','') = 'temporary_organizer'
    and o.status = 'active'
    and g.status = 'active'
    and g.starts_at <= now()
    and g.expires_at > now()
  order by g.expires_at desc, g.created_at desc
  limit 1;
$$;

create or replace function public.current_ticket_organizer_organization(p_user_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public, auth, pg_temp
as $$
  select g.organization_id
  from public.ticket_organizer_access_grants g
  join public.ticket_organizer_organizations o on o.id = g.organization_id
  join auth.users u on u.id = g.user_id
  where g.user_id = p_user_id
    and coalesce(u.raw_app_meta_data->>'eya_account_type','') = 'temporary_organizer'
    and o.status = 'active'
    and g.status = 'active'
    and g.starts_at <= now()
    and g.expires_at > now()
  order by g.expires_at desc, g.created_at desc
  limit 1;
$$;

revoke all on function public.current_ticket_organizer_organization(uuid) from public, anon, authenticated;
grant execute on function public.current_ticket_organizer_organization(uuid) to service_role;

create or replace function public.admin_create_ticket_organizer_invite(
  p_email text,
  p_organization_name text,
  p_access_expires_at timestamptz,
  p_admin_note text default null,
  p_invite_hours integer default 72
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
declare
  v_admin uuid := auth.uid();
  v_email text := lower(trim(coalesce(p_email,'')));
  v_org text := trim(coalesce(p_organization_name,''));
  v_org_id uuid;
  v_raw_token text;
  v_token_hash text;
  v_invite public.ticket_organizer_invites%rowtype;
  v_invite_hours integer := greatest(1, least(coalesce(p_invite_hours,72), 168));
begin
  if v_admin is null or not public.is_admin() then raise exception 'Admin access required.'; end if;
  if v_email = '' or position('@' in v_email) <= 1 then raise exception 'A valid organizer email is required.'; end if;
  if v_org = '' then raise exception 'Organization or promoter name is required.'; end if;
  if p_access_expires_at is null or p_access_expires_at <= now() + interval '1 hour' then raise exception 'Organizer access expiry must be in the future.'; end if;

  if exists (select 1 from auth.users u where lower(u.email) = v_email) then
    raise exception 'That email already belongs to an EYA account. Use a separate organizer email for the temporary Organizer Workspace.';
  end if;

  select i.organization_id into v_org_id
  from public.ticket_organizer_invites i
  join public.ticket_organizer_organizations o on o.id=i.organization_id and o.status='active'
  where i.email=v_email and lower(trim(i.organization_name))=lower(v_org)
  order by i.created_at desc
  limit 1;

  if v_org_id is null then
    insert into public.ticket_organizer_organizations(name,created_by,metadata)
    values (v_org,v_admin,jsonb_build_object('created_from','initial_organizer_invite'))
    returning id into v_org_id;
  end if;

  update public.ticket_organizer_invites
  set status = case when invite_expires_at <= now() then 'expired' else 'revoked' end,
      revoked_at = case when invite_expires_at > now() then now() else revoked_at end,
      revoked_by = case when invite_expires_at > now() then v_admin else revoked_by end,
      revoke_note = case when invite_expires_at > now() then 'Replaced by a newer organizer invitation.' else revoke_note end,
      updated_at = now()
  where email = v_email and status = 'pending';

  v_raw_token := 'EYA-ORG-INV-1-' || encode(gen_random_bytes(32),'hex');
  v_token_hash := encode(digest(v_raw_token,'sha256'),'hex');

  insert into public.ticket_organizer_invites(
    organization_id,email,organization_name,token_hash,invite_expires_at,access_expires_at,
    created_by,admin_note
  ) values (
    v_org_id,v_email,v_org,v_token_hash,now() + make_interval(hours => v_invite_hours),
    p_access_expires_at,v_admin,nullif(trim(p_admin_note),'')
  ) returning * into v_invite;

  return jsonb_build_object(
    'ok',true,
    'invite_id',v_invite.id,
    'organization_id',v_invite.organization_id,
    'email',v_invite.email,
    'organization_name',v_invite.organization_name,
    'invite_token',v_raw_token,
    'invite_expires_at',v_invite.invite_expires_at,
    'access_expires_at',v_invite.access_expires_at
  );
end;
$$;

create or replace function public.claim_ticket_organizer_invite(p_token text,p_user_id uuid,p_full_name text default null)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
declare
  v_hash text;
  v_invite public.ticket_organizer_invites%rowtype;
  v_user_email text;
  v_account_type text;
  v_grant_id uuid;
  v_org_status text;
begin
  if current_user not in ('service_role','postgres') then raise exception 'Service role required.'; end if;
  if p_token is null or p_token !~ '^EYA-ORG-INV-1-[0-9a-fA-F]{64}$' then raise exception 'Invalid organizer invitation.'; end if;
  v_hash := encode(digest(p_token,'sha256'),'hex');
  select * into v_invite from public.ticket_organizer_invites where token_hash=v_hash for update;
  if not found then raise exception 'Organizer invitation not found.'; end if;
  if v_invite.status <> 'pending' then raise exception 'This organizer invitation has already been used or revoked.'; end if;
  if v_invite.invite_expires_at <= now() then
    update public.ticket_organizer_invites set status='expired',updated_at=now() where id=v_invite.id;
    raise exception 'This organizer invitation has expired.';
  end if;
  if v_invite.access_expires_at <= now() then raise exception 'The organizer access window has already ended.'; end if;

  select status into v_org_status from public.ticket_organizer_organizations where id=v_invite.organization_id;
  if not found or v_org_status <> 'active' then raise exception 'This promoter organization is not active.'; end if;

  select lower(u.email), coalesce(u.raw_app_meta_data->>'eya_account_type','')
    into v_user_email, v_account_type
  from auth.users u where u.id=p_user_id;
  if not found then raise exception 'Temporary organizer identity was not created.'; end if;
  if v_user_email is distinct from v_invite.email then raise exception 'Organizer email does not match this invitation.'; end if;
  if v_account_type <> 'temporary_organizer' then raise exception 'Temporary organizer account marker is missing.'; end if;

  insert into public.profiles(id,full_name,email,role,onboarded)
  values (p_user_id,nullif(trim(p_full_name),''),v_invite.email,'student',true)
  on conflict(id) do update set
    full_name=coalesce(excluded.full_name,public.profiles.full_name),
    email=excluded.email,
    onboarded=true;

  update public.ticket_organizer_access_grants
  set status='expired',updated_at=now()
  where user_id=p_user_id and status='active' and expires_at <= now();

  if exists (select 1 from public.ticket_organizer_access_grants where user_id=p_user_id and status='active') then
    raise exception 'This temporary organizer already has active access.';
  end if;

  insert into public.ticket_organizer_access_grants(
    organization_id,user_id,organization_name,status,starts_at,expires_at,granted_by,grant_note
  ) values (
    v_invite.organization_id,p_user_id,v_invite.organization_name,'active',now(),v_invite.access_expires_at,
    v_invite.created_by,coalesce(v_invite.admin_note,'Created from one-time organizer invitation')
  ) returning id into v_grant_id;

  update public.ticket_organizer_invites
  set status='claimed',claimed_user_id=p_user_id,claimed_at=now(),updated_at=now()
  where id=v_invite.id;

  return jsonb_build_object(
    'ok',true,
    'invite_id',v_invite.id,
    'grant_id',v_grant_id,
    'organization_id',v_invite.organization_id,
    'user_id',p_user_id,
    'email',v_invite.email,
    'organization_name',v_invite.organization_name,
    'access_expires_at',v_invite.access_expires_at
  );
end;
$$;

create or replace function public.get_my_ticket_organizer_access()
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_grant public.ticket_organizer_access_grants%rowtype;
  v_org public.ticket_organizer_organizations%rowtype;
begin
  if v_user is null then raise exception 'Authentication required.'; end if;

  update public.ticket_organizer_access_grants
  set status='expired',updated_at=now()
  where user_id=v_user and status='active' and expires_at <= now();

  select g.* into v_grant
  from public.ticket_organizer_access_grants g
  join public.ticket_organizer_organizations o on o.id=g.organization_id and o.status='active'
  where g.user_id=v_user and g.status='active' and g.starts_at <= now() and g.expires_at > now()
  order by g.expires_at desc,g.created_at desc
  limit 1;

  if not found then
    perform public.set_temporary_organizer_auth_ban(v_user,true);
    return null;
  end if;

  select * into v_org from public.ticket_organizer_organizations where id=v_grant.organization_id;
  perform public.set_temporary_organizer_auth_ban(v_user,false);

  return jsonb_build_object(
    'id',v_grant.id,
    'organization_id',v_grant.organization_id,
    'user_id',v_grant.user_id,
    'organization_name',v_org.name,
    'organization_status',v_org.status,
    'status',v_grant.status,
    'starts_at',v_grant.starts_at,
    'expires_at',v_grant.expires_at,
    'grant_note',v_grant.grant_note
  );
end;
$$;

create or replace function public.admin_regrant_ticket_organizer_access(p_user_id uuid,p_expires_at timestamptz,p_note text default null)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_admin uuid := auth.uid();
  v_org text;
  v_org_id uuid;
  v_grant public.ticket_organizer_access_grants%rowtype;
  v_account_type text;
begin
  if v_admin is null or not public.is_admin() then raise exception 'Admin access required.'; end if;
  if p_expires_at is null or p_expires_at <= now() + interval '1 hour' then raise exception 'Organizer access expiry must be in the future.'; end if;

  select coalesce(u.raw_app_meta_data->>'eya_account_type','') into v_account_type
  from auth.users u where u.id=p_user_id;
  if not found or v_account_type <> 'temporary_organizer' then
    raise exception 'Only a temporary Organizer account can be re-enabled here.';
  end if;

  update public.ticket_organizer_access_grants
  set status='expired',updated_at=now()
  where user_id=p_user_id and status='active' and expires_at <= now();

  if exists (
    select 1 from public.ticket_organizer_access_grants g
    where g.user_id=p_user_id and g.status='active' and g.expires_at > now()
  ) then raise exception 'This organizer already has active access.'; end if;

  select g.organization_id,o.name into v_org_id,v_org
  from public.ticket_organizer_access_grants g
  join public.ticket_organizer_organizations o on o.id=g.organization_id and o.status='active'
  where g.user_id=p_user_id
  order by g.created_at desc
  limit 1;
  if v_org_id is null then raise exception 'Organizer organization history not found or inactive.'; end if;

  insert into public.ticket_organizer_access_grants(
    organization_id,user_id,organization_name,status,starts_at,expires_at,granted_by,grant_note
  ) values (
    v_org_id,p_user_id,v_org,'active',now(),p_expires_at,v_admin,
    coalesce(nullif(trim(p_note),''),'Re-enabled by EYA Admin')
  ) returning * into v_grant;

  perform public.set_temporary_organizer_auth_ban(p_user_id,false);
  return jsonb_build_object(
    'ok',true,
    'grant_id',v_grant.id,
    'organization_id',v_grant.organization_id,
    'user_id',v_grant.user_id,
    'organization_name',v_grant.organization_name,
    'status',v_grant.status,
    'starts_at',v_grant.starts_at,
    'expires_at',v_grant.expires_at
  );
end;
$$;

create or replace function public.create_my_ticket_event_draft(
  p_title text,p_category text,p_description text,p_date_label text,
  p_starts_at timestamptz,p_ends_at timestamptz,p_venue text,p_city text,
  p_image_url text,p_hero_image_url text
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_grant uuid;
  v_org uuid;
  v_event public.ticket_events%rowtype;
begin
  if v_user is null then raise exception 'Authentication required.'; end if;
  v_grant := public.current_ticket_organizer_grant(v_user);
  if v_grant is null then raise exception 'Temporary organizer access is required. EYA Admin must invite and activate your Organizer Workspace.'; end if;
  select organization_id into v_org from public.ticket_organizer_access_grants where id=v_grant;
  if v_org is null then raise exception 'Organizer organization is missing.'; end if;
  if nullif(trim(p_title),'') is null then raise exception 'Event title is required.'; end if;
  if nullif(trim(p_date_label),'') is null then raise exception 'Event date label is required.'; end if;
  if nullif(trim(p_venue),'') is null then raise exception 'Venue is required.'; end if;
  if nullif(trim(p_city),'') is null then raise exception 'City is required.'; end if;
  if nullif(trim(p_image_url),'') is null or nullif(trim(p_hero_image_url),'') is null then raise exception 'Card and hero images are required.'; end if;
  if p_ends_at is not null and p_starts_at is not null and p_ends_at <= p_starts_at then raise exception 'Event end time must be after the start time.'; end if;

  insert into public.ticket_events(
    title,category,description,date_label,starts_at,ends_at,venue,city,
    image_url,hero_image_url,status,organization_id,organizer_id,organizer_access_grant_id,created_by
  ) values (
    trim(p_title),coalesce(nullif(trim(p_category),''),'Music'),nullif(trim(p_description),''),
    trim(p_date_label),p_starts_at,p_ends_at,trim(p_venue),trim(p_city),
    trim(p_image_url),trim(p_hero_image_url),'draft',v_org,v_user,v_grant,v_user
  ) returning * into v_event;

  insert into public.ticket_event_review_log(event_id,actor_id,action,from_status,to_status)
  values (v_event.id,v_user,'created',null,'draft');

  return jsonb_build_object('ok',true,'event_id',v_event.id,'organization_id',v_event.organization_id,'status',v_event.status);
end;
$$;

create or replace function public.admin_set_ticket_event_finance_controls(
  p_event_id uuid,p_reserve_required_mwk numeric,p_platform_fee_mwk numeric,
  p_other_hold_mwk numeric default 0,p_status text default 'open',p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_admin uuid := auth.uid();
  v_event public.ticket_events%rowtype;
  v_existing public.ticket_event_finance_controls%rowtype;
  v_previous jsonb;
  v_new public.ticket_event_finance_controls%rowtype;
  v_status text := lower(trim(coalesce(p_status,'open')));
begin
  if v_admin is null or not public.is_admin() then raise exception 'Admin access required.'; end if;

  select * into v_event from public.ticket_events where id=p_event_id;
  if not found or v_event.organizer_id is null or v_event.organization_id is null then raise exception 'Organizer-owned event not found.'; end if;
  if v_event.approved_version_id is null or v_event.approved_version_number is null then
    raise exception 'Finance controls can be configured only after EYA approves the organizer event + tickets.';
  end if;
  if v_event.status not in ('published','paused','archived','cancelled') then
    raise exception 'This organizer event is not in a finance-manageable status.';
  end if;

  if p_reserve_required_mwk is null or p_reserve_required_mwk < 0 or p_reserve_required_mwk <> trunc(p_reserve_required_mwk)
     or p_platform_fee_mwk is null or p_platform_fee_mwk < 0 or p_platform_fee_mwk <> trunc(p_platform_fee_mwk)
     or p_other_hold_mwk is null or p_other_hold_mwk < 0 or p_other_hold_mwk <> trunc(p_other_hold_mwk) then
    raise exception 'Finance control amounts must be whole-MWK values of zero or more.';
  end if;
  if v_status not in ('open','frozen') then raise exception 'Admin finance status must be open or frozen. Settled is set only by completed final settlement.'; end if;

  select * into v_existing from public.ticket_event_finance_controls where event_id=p_event_id for update;
  if found then
    if v_existing.status='settled' then raise exception 'A settled event finance account cannot be reopened through this control.'; end if;
    v_previous := to_jsonb(v_existing);
  else
    v_previous := null;
  end if;

  insert into public.ticket_event_finance_controls(
    event_id,organization_id,organizer_id,reserve_required_mwk,platform_fee_mwk,other_hold_mwk,
    status,admin_note,updated_by,updated_at
  ) values (
    p_event_id,v_event.organization_id,v_event.organizer_id,p_reserve_required_mwk,p_platform_fee_mwk,p_other_hold_mwk,
    v_status,nullif(trim(p_note),''),v_admin,now()
  )
  on conflict(event_id) do update set
    organization_id=excluded.organization_id,
    organizer_id=excluded.organizer_id,
    reserve_required_mwk=excluded.reserve_required_mwk,
    platform_fee_mwk=excluded.platform_fee_mwk,
    other_hold_mwk=excluded.other_hold_mwk,
    status=excluded.status,
    admin_note=excluded.admin_note,
    updated_by=excluded.updated_by,
    updated_at=now()
  returning * into v_new;

  insert into public.ticket_event_finance_control_log(event_id,actor_id,action,previous_state,new_state,note)
  values (p_event_id,v_admin,case when v_previous is null then 'configured' else 'updated' end,v_previous,to_jsonb(v_new),nullif(trim(p_note),''));

  return public.ticket_event_finance_snapshot(p_event_id);
end;
$$;

create or replace function public.request_my_ticket_event_payout(
  p_event_id uuid,p_request_type text,p_requested_amount_mwk numeric default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_event public.ticket_events%rowtype;
  v_controls public.ticket_event_finance_controls%rowtype;
  v_type text := lower(trim(coalesce(p_request_type,'')));
  v_snapshot jsonb;
  v_available numeric(14,2);
  v_amount numeric(14,2);
  v_request public.ticket_event_payout_requests%rowtype;
begin
  if v_user is null then raise exception 'Authentication required.'; end if;
  if public.current_ticket_organizer_grant(v_user) is null then
    raise exception 'Temporary Organizer Workspace access is expired or revoked.';
  end if;

  select * into v_event from public.ticket_events where id=p_event_id for update;
  if not found or v_event.organizer_id is distinct from v_user or v_event.organization_id is null then
    raise exception 'Organizer event not found.';
  end if;
  if v_event.approved_version_id is null or v_event.approved_version_number is null then
    raise exception 'Only an EYA-approved organizer event can request payouts.';
  end if;

  select * into v_controls from public.ticket_event_finance_controls where event_id=p_event_id for update;
  if not found then raise exception 'EYA has not configured payout controls for this event yet.'; end if;
  if v_controls.organization_id is distinct from v_event.organization_id then raise exception 'Event finance organization mismatch.'; end if;
  if v_controls.status <> 'open' then raise exception 'Payouts for this event are currently %.',v_controls.status; end if;

  if exists (select 1 from public.ticket_event_payout_requests where event_id=p_event_id and status in ('pending','approved')) then
    raise exception 'This event already has an open payout request.';
  end if;

  v_snapshot := public.ticket_event_finance_snapshot(p_event_id);
  v_available := coalesce((v_snapshot->>'available_for_payout_mwk')::numeric,0);
  if v_available <= 0 then raise exception 'No event funds are currently available for payout.'; end if;

  if v_type='early_payout' then
    if v_event.status <> 'published' then raise exception 'Early payout is available only while the event is published.'; end if;
    if coalesce((v_snapshot->>'event_finished')::boolean,false) then raise exception 'This event has finished. Request final settlement instead.'; end if;
    if p_requested_amount_mwk is null or p_requested_amount_mwk <= 0 or p_requested_amount_mwk <> trunc(p_requested_amount_mwk) then
      raise exception 'Enter a whole-MWK early payout amount greater than zero.';
    end if;
    if p_requested_amount_mwk > v_available then raise exception 'Requested amount exceeds the currently eligible early payout amount.'; end if;
    v_amount := p_requested_amount_mwk;
  elsif v_type='final_settlement' then
    if not coalesce((v_snapshot->>'event_finished')::boolean,false) then raise exception 'Final settlement is available only after the event has finished.'; end if;
    if not coalesce((v_snapshot->>'final_settlement_ready')::boolean,false) then raise exception 'Final settlement is not ready. EYA must clear the refund reserve and any manual hold first.'; end if;
    v_amount := trunc(v_available);
    if v_amount <= 0 then raise exception 'No funds remain for final settlement.'; end if;
  else
    raise exception 'request_type must be early_payout or final_settlement.';
  end if;

  insert into public.ticket_event_payout_requests(
    event_id,organization_id,organizer_id,request_type,requested_amount_mwk,metadata
  ) values (
    p_event_id,v_event.organization_id,v_user,v_type,v_amount,
    jsonb_build_object('finance_snapshot_at_request',v_snapshot)
  ) returning * into v_request;

  return jsonb_build_object(
    'ok',true,
    'request_id',v_request.id,
    'organization_id',v_request.organization_id,
    'request_type',v_request.request_type,
    'requested_amount_mwk',v_request.requested_amount_mwk,
    'status',v_request.status
  );
end;
$$;

create or replace function public.ticket_event_finance_snapshot(p_event_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_event public.ticket_events%rowtype;
  v_controls public.ticket_event_finance_controls%rowtype;
  v_has_controls boolean := false;
  v_gross_sales numeric(14,2) := 0;
  v_active_paid_sales numeric(14,2) := 0;
  v_refunded_sales numeric(14,2) := 0;
  v_service_fees_paid numeric(14,2) := 0;
  v_paid_out numeric(14,2) := 0;
  v_approved_unpaid numeric(14,2) := 0;
  v_net_before_payout numeric(14,2) := 0;
  v_available numeric(14,2) := 0;
  v_liability numeric(14,2) := 0;
  v_finished boolean := false;
  v_final_ready boolean := false;
begin
  select * into v_event from public.ticket_events where id=p_event_id;
  if not found then raise exception 'Event not found.'; end if;

  select * into v_controls from public.ticket_event_finance_controls where event_id=p_event_id;
  v_has_controls := found;

  select
    coalesce(sum(case when payment_status in ('paid','refunded') then unit_price_mwk*quantity else 0 end),0),
    coalesce(sum(case when payment_status='paid' then unit_price_mwk*quantity else 0 end),0),
    coalesce(sum(case when payment_status='refunded' then unit_price_mwk*quantity else 0 end),0),
    coalesce(sum(case when payment_status='paid' then service_fee_mwk else 0 end),0)
  into v_gross_sales,v_active_paid_sales,v_refunded_sales,v_service_fees_paid
  from public.ticket_orders where event_id=p_event_id;

  select
    coalesce(sum(case when status='paid' then approved_amount_mwk else 0 end),0),
    coalesce(sum(case when status='approved' then approved_amount_mwk else 0 end),0)
  into v_paid_out,v_approved_unpaid
  from public.ticket_event_payout_requests where event_id=p_event_id;

  v_finished := coalesce(v_event.ends_at,v_event.starts_at) is not null
    and coalesce(v_event.ends_at,v_event.starts_at) <= now();

  if v_has_controls then
    if v_controls.organization_id is distinct from v_event.organization_id then
      raise exception 'Event finance organization mismatch.';
    end if;
    v_net_before_payout := greatest(v_active_paid_sales-v_controls.platform_fee_mwk-v_controls.reserve_required_mwk-v_controls.other_hold_mwk,0);
    v_liability := greatest((v_paid_out+v_approved_unpaid)-v_net_before_payout,0);
  else
    v_net_before_payout := 0;
    v_liability := 0;
  end if;

  if v_has_controls and v_controls.status='open' and v_liability=0 then
    v_available := greatest(v_net_before_payout-v_paid_out-v_approved_unpaid,0);
  else
    v_available := 0;
  end if;

  v_final_ready := v_has_controls
    and v_controls.status='open'
    and v_liability=0
    and v_finished
    and v_event.status in ('published','paused','archived')
    and v_controls.reserve_required_mwk=0
    and v_controls.other_hold_mwk=0;

  return jsonb_build_object(
    'event_id',v_event.id,
    'organization_id',v_event.organization_id,
    'event_title',v_event.title,
    'event_status',v_event.status,
    'organizer_id',v_event.organizer_id,
    'starts_at',v_event.starts_at,
    'ends_at',v_event.ends_at,
    'event_finished',v_finished,
    'payouts_configured',v_has_controls,
    'finance_status',case when v_has_controls then v_controls.status else 'unconfigured' end,
    'gross_ticket_sales_mwk',v_gross_sales,
    'active_paid_ticket_sales_mwk',v_active_paid_sales,
    'refunded_ticket_sales_mwk',v_refunded_sales,
    'service_fees_paid_mwk',v_service_fees_paid,
    'platform_fee_mwk',case when v_has_controls then v_controls.platform_fee_mwk else 0 end,
    'protected_refund_reserve_mwk',case when v_has_controls then v_controls.reserve_required_mwk else 0 end,
    'other_hold_mwk',case when v_has_controls then v_controls.other_hold_mwk else 0 end,
    'net_event_funds_before_payout_mwk',v_net_before_payout,
    'paid_out_mwk',v_paid_out,
    'approved_unpaid_mwk',v_approved_unpaid,
    'organizer_advance_liability_mwk',v_liability,
    'available_for_payout_mwk',v_available,
    'final_settlement_ready',v_final_ready
  );
end;
$$;