create or replace function public.set_temporary_organizer_auth_ban(p_user_id uuid, p_banned boolean)
returns void
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
begin
  update auth.users
  set banned_until = case when p_banned then 'infinity'::timestamptz else null end,
      updated_at = now()
  where id = p_user_id
    and coalesce(raw_app_meta_data->>'eya_account_type','') = 'temporary_organizer';
end;
$$;
revoke all on function public.set_temporary_organizer_auth_ban(uuid,boolean) from public,anon,authenticated;

create or replace function public.get_my_ticket_organizer_access() returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_grant public.ticket_organizer_access_grants%rowtype;
begin
  if v_user is null then raise exception 'Authentication required.'; end if;

  update public.ticket_organizer_access_grants
  set status = 'expired', updated_at = now()
  where user_id = v_user and status = 'active' and expires_at <= now();

  select * into v_grant
  from public.ticket_organizer_access_grants
  where user_id = v_user and status = 'active' and starts_at <= now() and expires_at > now()
  order by expires_at desc, created_at desc
  limit 1;

  if not found then
    perform public.set_temporary_organizer_auth_ban(v_user, true);
    return null;
  end if;

  perform public.set_temporary_organizer_auth_ban(v_user, false);
  return jsonb_build_object(
    'id', v_grant.id,
    'user_id', v_grant.user_id,
    'organization_name', v_grant.organization_name,
    'status', v_grant.status,
    'starts_at', v_grant.starts_at,
    'expires_at', v_grant.expires_at,
    'grant_note', v_grant.grant_note
  );
end;
$$;

create or replace function public.admin_revoke_ticket_organizer_access(p_grant_id uuid, p_note text default null) returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_admin uuid := auth.uid();
  v_grant public.ticket_organizer_access_grants%rowtype;
begin
  if v_admin is null or not public.is_admin() then raise exception 'Admin access required.'; end if;
  select * into v_grant from public.ticket_organizer_access_grants where id = p_grant_id for update;
  if not found then raise exception 'Organizer access grant not found.'; end if;
  if v_grant.status = 'revoked' then
    perform public.set_temporary_organizer_auth_ban(v_grant.user_id, true);
    return jsonb_build_object('ok',true,'grant_id',v_grant.id,'status','revoked');
  end if;

  update public.ticket_organizer_access_grants
  set status='revoked', revoked_at=now(), revoked_by=v_admin,
      revoke_note=coalesce(nullif(trim(p_note),''),'Revoked by EYA Admin'), updated_at=now()
  where id=p_grant_id returning * into v_grant;

  perform public.set_temporary_organizer_auth_ban(v_grant.user_id, true);
  return jsonb_build_object('ok',true,'grant_id',v_grant.id,'status',v_grant.status);
end;
$$;

create or replace function public.admin_extend_ticket_organizer_access(p_grant_id uuid, p_expires_at timestamptz, p_note text default null) returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_admin uuid := auth.uid();
  v_grant public.ticket_organizer_access_grants%rowtype;
begin
  if v_admin is null or not public.is_admin() then raise exception 'Admin access required.'; end if;
  if p_expires_at is null or p_expires_at <= now() + interval '1 hour' then raise exception 'Organizer access expiry must be in the future.'; end if;

  select * into v_grant from public.ticket_organizer_access_grants where id = p_grant_id for update;
  if not found then raise exception 'Organizer access grant not found.'; end if;
  if v_grant.status = 'revoked' then raise exception 'Revoked organizer access cannot be reactivated. Create a new grant.'; end if;

  if exists (
    select 1 from public.ticket_organizer_access_grants g
    where g.user_id = v_grant.user_id and g.id <> v_grant.id and g.status = 'active' and g.expires_at > now()
  ) then raise exception 'This user already has another active organizer grant.'; end if;

  update public.ticket_organizer_access_grants
  set status = 'active', expires_at = p_expires_at,
      grant_note = coalesce(nullif(trim(p_note),''), grant_note), updated_at = now()
  where id = p_grant_id
  returning * into v_grant;

  perform public.set_temporary_organizer_auth_ban(v_grant.user_id, false);
  return jsonb_build_object('ok',true,'grant_id',v_grant.id,'status',v_grant.status,'expires_at',v_grant.expires_at);
end;
$$;

revoke all on function public.get_my_ticket_organizer_access() from public,anon;
grant execute on function public.get_my_ticket_organizer_access() to authenticated;
revoke all on function public.admin_revoke_ticket_organizer_access(uuid,text) from public,anon;
grant execute on function public.admin_revoke_ticket_organizer_access(uuid,text) to authenticated;
revoke all on function public.admin_extend_ticket_organizer_access(uuid,timestamptz,text) from public,anon;
grant execute on function public.admin_extend_ticket_organizer_access(uuid,timestamptz,text) to authenticated;
