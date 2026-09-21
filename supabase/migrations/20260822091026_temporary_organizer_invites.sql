create table if not exists public.ticket_organizer_invites (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  organization_name text not null,
  token_hash text not null unique,
  status text not null default 'pending' check (status = any (array['pending'::text,'claimed'::text,'revoked'::text,'expired'::text])),
  invite_expires_at timestamptz not null,
  access_expires_at timestamptz not null,
  created_by uuid not null references auth.users(id) on delete restrict,
  admin_note text,
  claimed_user_id uuid references auth.users(id) on delete restrict,
  claimed_at timestamptz,
  revoked_at timestamptz,
  revoked_by uuid references auth.users(id) on delete set null,
  revoke_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  constraint ticket_organizer_invites_email_check check (email = lower(trim(email)) and position('@' in email) > 1),
  constraint ticket_organizer_invites_windows_check check (invite_expires_at > created_at and access_expires_at > created_at),
  constraint ticket_organizer_invites_claim_check check (
    (status = 'claimed' and claimed_user_id is not null and claimed_at is not null)
    or (status <> 'claimed')
  )
);

create unique index if not exists ticket_organizer_invites_one_pending_email_idx
  on public.ticket_organizer_invites(email)
  where status = 'pending';
create index if not exists ticket_organizer_invites_status_expiry_idx
  on public.ticket_organizer_invites(status, invite_expires_at);
create index if not exists ticket_organizer_invites_claimed_user_idx
  on public.ticket_organizer_invites(claimed_user_id)
  where claimed_user_id is not null;

alter table public.ticket_organizer_invites enable row level security;
revoke all on public.ticket_organizer_invites from public, anon, authenticated;
grant all on public.ticket_organizer_invites to service_role;

create or replace function public.admin_create_ticket_organizer_invite(
  p_email text,
  p_organization_name text,
  p_access_expires_at timestamptz,
  p_admin_note text default null,
  p_invite_hours integer default 72
) returns jsonb
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
declare
  v_admin uuid := auth.uid();
  v_email text := lower(trim(coalesce(p_email,'')));
  v_org text := trim(coalesce(p_organization_name,''));
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
    email, organization_name, token_hash, invite_expires_at, access_expires_at,
    created_by, admin_note
  ) values (
    v_email, v_org, v_token_hash, now() + make_interval(hours => v_invite_hours),
    p_access_expires_at, v_admin, nullif(trim(p_admin_note),'')
  ) returning * into v_invite;

  return jsonb_build_object(
    'ok', true,
    'invite_id', v_invite.id,
    'email', v_invite.email,
    'organization_name', v_invite.organization_name,
    'invite_token', v_raw_token,
    'invite_expires_at', v_invite.invite_expires_at,
    'access_expires_at', v_invite.access_expires_at
  );
end;
$$;

create or replace function public.admin_list_ticket_organizer_invites()
returns jsonb
language sql
security definer
set search_path = public, auth
as $$
  select case when public.is_admin() then
    coalesce(jsonb_agg(jsonb_build_object(
      'id', i.id,
      'email', i.email,
      'organization_name', i.organization_name,
      'status', case when i.status='pending' and i.invite_expires_at <= now() then 'expired' else i.status end,
      'invite_expires_at', i.invite_expires_at,
      'access_expires_at', i.access_expires_at,
      'admin_note', i.admin_note,
      'claimed_user_id', i.claimed_user_id,
      'claimed_at', i.claimed_at,
      'revoked_at', i.revoked_at,
      'revoke_note', i.revoke_note,
      'created_at', i.created_at
    ) order by i.created_at desc), '[]'::jsonb)
  else jsonb_build_object('error','Admin access required.') end
  from public.ticket_organizer_invites i;
$$;

create or replace function public.admin_revoke_ticket_organizer_invite(
  p_invite_id uuid,
  p_note text default null
) returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_admin uuid := auth.uid();
  v_invite public.ticket_organizer_invites%rowtype;
begin
  if v_admin is null or not public.is_admin() then raise exception 'Admin access required.'; end if;
  select * into v_invite from public.ticket_organizer_invites where id=p_invite_id for update;
  if not found then raise exception 'Organizer invitation not found.'; end if;
  if v_invite.status <> 'pending' then raise exception 'Only an unused organizer invitation can be revoked.'; end if;

  update public.ticket_organizer_invites
  set status='revoked', revoked_at=now(), revoked_by=v_admin,
      revoke_note=coalesce(nullif(trim(p_note),''),'Revoked by EYA Admin'), updated_at=now()
  where id=p_invite_id;

  return jsonb_build_object('ok',true,'invite_id',p_invite_id,'status','revoked');
end;
$$;

create or replace function public.get_ticket_organizer_invite_claim_info(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
declare
  v_hash text;
  v_invite public.ticket_organizer_invites%rowtype;
begin
  if current_user not in ('service_role','postgres') then raise exception 'Service role required.'; end if;
  if p_token is null or p_token !~ '^EYA-ORG-INV-1-[0-9a-fA-F]{64}$' then raise exception 'Invalid organizer invitation.'; end if;
  v_hash := encode(digest(p_token,'sha256'),'hex');
  select * into v_invite from public.ticket_organizer_invites where token_hash=v_hash for update;
  if not found then raise exception 'Organizer invitation not found.'; end if;
  if v_invite.status <> 'pending' then raise exception 'This organizer invitation is no longer available.'; end if;
  if v_invite.invite_expires_at <= now() then
    update public.ticket_organizer_invites set status='expired',updated_at=now() where id=v_invite.id;
    raise exception 'This organizer invitation has expired.';
  end if;
  if v_invite.access_expires_at <= now() then raise exception 'The organizer access window has already ended.'; end if;
  if exists (select 1 from auth.users u where lower(u.email)=v_invite.email) then
    raise exception 'This organizer email is already registered. Ask EYA Admin for a new invitation.';
  end if;

  return jsonb_build_object(
    'ok',true,
    'invite_id',v_invite.id,
    'email',v_invite.email,
    'organization_name',v_invite.organization_name,
    'invite_expires_at',v_invite.invite_expires_at,
    'access_expires_at',v_invite.access_expires_at
  );
end;
$$;

create or replace function public.claim_ticket_organizer_invite(
  p_token text,
  p_user_id uuid,
  p_full_name text default null
) returns jsonb
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
    user_id,organization_name,status,starts_at,expires_at,granted_by,grant_note
  ) values (
    p_user_id,v_invite.organization_name,'active',now(),v_invite.access_expires_at,
    v_invite.created_by,coalesce(v_invite.admin_note,'Created from one-time organizer invitation')
  ) returning id into v_grant_id;

  update public.ticket_organizer_invites
  set status='claimed',claimed_user_id=p_user_id,claimed_at=now(),updated_at=now()
  where id=v_invite.id;

  return jsonb_build_object(
    'ok',true,
    'invite_id',v_invite.id,
    'grant_id',v_grant_id,
    'user_id',p_user_id,
    'email',v_invite.email,
    'organization_name',v_invite.organization_name,
    'access_expires_at',v_invite.access_expires_at
  );
end;
$$;

revoke all on function public.admin_create_ticket_organizer_invite(text,text,timestamptz,text,integer) from public,anon;
grant execute on function public.admin_create_ticket_organizer_invite(text,text,timestamptz,text,integer) to authenticated;
revoke all on function public.admin_list_ticket_organizer_invites() from public,anon;
grant execute on function public.admin_list_ticket_organizer_invites() to authenticated;
revoke all on function public.admin_revoke_ticket_organizer_invite(uuid,text) from public,anon;
grant execute on function public.admin_revoke_ticket_organizer_invite(uuid,text) to authenticated;

revoke all on function public.get_ticket_organizer_invite_claim_info(text) from public,anon,authenticated;
grant execute on function public.get_ticket_organizer_invite_claim_info(text) to service_role;
revoke all on function public.claim_ticket_organizer_invite(text,uuid,text) from public,anon,authenticated;
grant execute on function public.claim_ticket_organizer_invite(text,uuid,text) to service_role;
