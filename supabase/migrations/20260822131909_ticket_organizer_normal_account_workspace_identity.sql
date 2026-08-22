-- Ticket Organizer is now a permission/workspace on a normal EYA account.
-- Legacy temporary-organizer identities remain readable only for compatibility;
-- new temporary organizer invitations are disabled.

create or replace function public.current_ticket_organizer_grant(p_user_id uuid)
returns uuid
language sql
stable
security definer
set search_path to 'public', 'auth', 'pg_temp'
as $$
  select g.id
  from public.ticket_organizer_access_grants g
  join public.ticket_organizer_organizations o on o.id = g.organization_id
  where g.user_id = p_user_id
    and o.status = 'active'
    and g.status = 'active'
    and g.starts_at <= now()
    and g.expires_at > now()
  order by g.expires_at desc, g.created_at desc
  limit 1;
$$;

create or replace function public.get_my_ticket_organizer_access()
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'auth', 'pg_temp'
as $$
declare
  v_user uuid := auth.uid();
  v_grant public.ticket_organizer_access_grants%rowtype;
  v_org public.ticket_organizer_organizations%rowtype;
  v_is_legacy_temp boolean := false;
begin
  if v_user is null then raise exception 'Authentication required.'; end if;

  select coalesce(u.raw_app_meta_data->>'eya_account_type','') = 'temporary_organizer'
    into v_is_legacy_temp
  from auth.users u
  where u.id = v_user;

  update public.ticket_organizer_access_grants
  set status='expired',updated_at=now()
  where user_id=v_user and status='active' and expires_at <= now();

  select g.* into v_grant
  from public.ticket_organizer_access_grants g
  join public.ticket_organizer_organizations o on o.id=g.organization_id and o.status='active'
  where g.user_id=v_user
    and g.status='active'
    and g.starts_at <= now()
    and g.expires_at > now()
  order by g.expires_at desc,g.created_at desc
  limit 1;

  if not found then
    if v_is_legacy_temp then
      perform public.set_temporary_organizer_auth_ban(v_user,true);
    end if;
    return null;
  end if;

  select * into v_org
  from public.ticket_organizer_organizations
  where id=v_grant.organization_id;

  if v_is_legacy_temp then
    perform public.set_temporary_organizer_auth_ban(v_user,false);
  end if;

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

create or replace function public.admin_grant_ticket_organizer_access(
  p_email text,
  p_organization_name text,
  p_expires_at timestamptz,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'auth', 'pg_temp'
as $$
declare
  v_admin uuid := auth.uid();
  v_email text := lower(trim(coalesce(p_email,'')));
  v_org_name text := trim(coalesce(p_organization_name,''));
  v_user uuid;
  v_org_id uuid;
  v_grant public.ticket_organizer_access_grants%rowtype;
begin
  if v_admin is null or not public.is_admin() then raise exception 'Admin access required.'; end if;
  if v_email = '' or position('@' in v_email) <= 1 then raise exception 'A valid EYA account email is required.'; end if;
  if v_org_name = '' then raise exception 'Organization or promoter name is required.'; end if;
  if p_expires_at is null or p_expires_at <= now() + interval '1 hour' then raise exception 'Ticket Management access expiry must be in the future.'; end if;

  select u.id into v_user
  from auth.users u
  where lower(trim(coalesce(u.email,''))) = v_email
  limit 1;

  if v_user is null then
    raise exception 'No EYA account was found for that email. Ask the organizer to create or sign in to their normal EYA account first.';
  end if;

  update public.ticket_organizer_access_grants
  set status='expired',updated_at=now()
  where user_id=v_user and status='active' and expires_at <= now();

  if exists (
    select 1
    from public.ticket_organizer_access_grants g
    where g.user_id=v_user and g.status='active' and g.expires_at > now()
  ) then
    raise exception 'This EYA user already has active Ticket Management access. Renew or revoke the current access instead.';
  end if;

  select o.id into v_org_id
  from public.ticket_organizer_organizations o
  where o.status='active'
    and lower(trim(o.name))=lower(v_org_name)
  order by o.created_at asc
  limit 1;

  if v_org_id is null then
    insert into public.ticket_organizer_organizations(name,created_by,metadata)
    values (
      v_org_name,
      v_admin,
      jsonb_build_object('created_from','admin_workspace_grant')
    )
    returning id into v_org_id;
  end if;

  insert into public.ticket_organizer_access_grants(
    organization_id,user_id,organization_name,status,starts_at,expires_at,granted_by,grant_note
  ) values (
    v_org_id,v_user,v_org_name,'active',now(),p_expires_at,v_admin,nullif(trim(p_note),'')
  ) returning * into v_grant;

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

create or replace function public.admin_extend_ticket_organizer_access(
  p_grant_id uuid,
  p_expires_at timestamptz,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'auth', 'pg_temp'
as $$
declare
  v_admin uuid := auth.uid();
  v_grant public.ticket_organizer_access_grants%rowtype;
  v_is_legacy_temp boolean := false;
begin
  if v_admin is null or not public.is_admin() then raise exception 'Admin access required.'; end if;
  if p_expires_at is null or p_expires_at <= now() + interval '1 hour' then raise exception 'Ticket Management access expiry must be in the future.'; end if;

  select * into v_grant
  from public.ticket_organizer_access_grants
  where id=p_grant_id
  for update;
  if not found then raise exception 'Organizer access grant not found.'; end if;
  if v_grant.status='revoked' then raise exception 'Revoked access cannot be renewed in place. Re-enable it to create a new grant.'; end if;

  if exists (
    select 1 from public.ticket_organizer_access_grants g
    where g.user_id=v_grant.user_id
      and g.id<>v_grant.id
      and g.status='active'
      and g.expires_at>now()
  ) then raise exception 'This user already has another active Ticket Management grant.'; end if;

  update public.ticket_organizer_access_grants
  set status='active',
      expires_at=p_expires_at,
      grant_note=coalesce(nullif(trim(p_note),''),grant_note),
      updated_at=now()
  where id=p_grant_id
  returning * into v_grant;

  select coalesce(u.raw_app_meta_data->>'eya_account_type','')='temporary_organizer'
    into v_is_legacy_temp
  from auth.users u where u.id=v_grant.user_id;
  if v_is_legacy_temp then perform public.set_temporary_organizer_auth_ban(v_grant.user_id,false); end if;

  return jsonb_build_object('ok',true,'grant_id',v_grant.id,'status',v_grant.status,'expires_at',v_grant.expires_at);
end;
$$;

create or replace function public.admin_regrant_ticket_organizer_access(
  p_user_id uuid,
  p_expires_at timestamptz,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'auth', 'pg_temp'
as $$
declare
  v_admin uuid := auth.uid();
  v_org text;
  v_org_id uuid;
  v_grant public.ticket_organizer_access_grants%rowtype;
  v_is_legacy_temp boolean := false;
begin
  if v_admin is null or not public.is_admin() then raise exception 'Admin access required.'; end if;
  if p_expires_at is null or p_expires_at <= now() + interval '1 hour' then raise exception 'Ticket Management access expiry must be in the future.'; end if;
  if not exists (select 1 from auth.users u where u.id=p_user_id) then raise exception 'EYA account not found.'; end if;

  update public.ticket_organizer_access_grants
  set status='expired',updated_at=now()
  where user_id=p_user_id and status='active' and expires_at <= now();

  if exists (
    select 1 from public.ticket_organizer_access_grants g
    where g.user_id=p_user_id and g.status='active' and g.expires_at > now()
  ) then raise exception 'This user already has active Ticket Management access.'; end if;

  select g.organization_id,o.name into v_org_id,v_org
  from public.ticket_organizer_access_grants g
  join public.ticket_organizer_organizations o on o.id=g.organization_id and o.status='active'
  where g.user_id=p_user_id
  order by g.created_at desc
  limit 1;

  if v_org_id is null then raise exception 'Promoter organization history not found or inactive.'; end if;

  insert into public.ticket_organizer_access_grants(
    organization_id,user_id,organization_name,status,starts_at,expires_at,granted_by,grant_note
  ) values (
    v_org_id,p_user_id,v_org,'active',now(),p_expires_at,v_admin,
    coalesce(nullif(trim(p_note),''),'Ticket Management re-enabled by EYA Admin')
  ) returning * into v_grant;

  select coalesce(u.raw_app_meta_data->>'eya_account_type','')='temporary_organizer'
    into v_is_legacy_temp
  from auth.users u where u.id=p_user_id;
  if v_is_legacy_temp then perform public.set_temporary_organizer_auth_ban(p_user_id,false); end if;

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

create or replace function public.admin_revoke_ticket_organizer_access(
  p_grant_id uuid,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'auth', 'pg_temp'
as $$
declare
  v_admin uuid := auth.uid();
  v_grant public.ticket_organizer_access_grants%rowtype;
  v_is_legacy_temp boolean := false;
begin
  if v_admin is null or not public.is_admin() then raise exception 'Admin access required.'; end if;

  select * into v_grant
  from public.ticket_organizer_access_grants
  where id=p_grant_id
  for update;
  if not found then raise exception 'Organizer access grant not found.'; end if;

  if v_grant.status <> 'revoked' then
    update public.ticket_organizer_access_grants
    set status='revoked',
        revoked_at=now(),
        revoked_by=v_admin,
        revoke_note=coalesce(nullif(trim(p_note),''),'Ticket Management revoked by EYA Admin'),
        updated_at=now()
    where id=p_grant_id
    returning * into v_grant;
  end if;

  select coalesce(u.raw_app_meta_data->>'eya_account_type','')='temporary_organizer'
    into v_is_legacy_temp
  from auth.users u where u.id=v_grant.user_id;
  if v_is_legacy_temp then perform public.set_temporary_organizer_auth_ban(v_grant.user_id,true); end if;

  return jsonb_build_object('ok',true,'grant_id',v_grant.id,'status','revoked');
end;
$$;

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
set search_path to 'public', 'auth', 'extensions'
as $$
begin
  if auth.uid() is null or not public.is_admin() then raise exception 'Admin access required.'; end if;
  raise exception 'Legacy temporary Organizer invitations are disabled. Grant Ticket Management to the organizer''s normal EYA account instead.';
end;
$$;

create or replace function public.claim_ticket_organizer_invite(
  p_token text,
  p_user_id uuid,
  p_full_name text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'auth', 'extensions'
as $$
begin
  raise exception 'Legacy temporary Organizer invitation claims are disabled. Use a normal EYA account with Admin-granted Ticket Management access.';
end;
$$;
