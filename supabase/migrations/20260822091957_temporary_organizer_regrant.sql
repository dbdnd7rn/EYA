create or replace function public.admin_regrant_ticket_organizer_access(
  p_user_id uuid,
  p_expires_at timestamptz,
  p_note text default null
) returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_admin uuid := auth.uid();
  v_org text;
  v_grant public.ticket_organizer_access_grants%rowtype;
  v_account_type text;
begin
  if v_admin is null or not public.is_admin() then raise exception 'Admin access required.'; end if;
  if p_expires_at is null or p_expires_at <= now() + interval '1 hour' then raise exception 'Organizer access expiry must be in the future.'; end if;

  select coalesce(u.raw_app_meta_data->>'eya_account_type','') into v_account_type
  from auth.users u where u.id = p_user_id;
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

  select g.organization_name into v_org
  from public.ticket_organizer_access_grants g
  where g.user_id=p_user_id
  order by g.created_at desc
  limit 1;
  if nullif(trim(v_org),'') is null then raise exception 'Organizer history not found.'; end if;

  insert into public.ticket_organizer_access_grants(
    user_id,organization_name,status,starts_at,expires_at,granted_by,grant_note
  ) values (
    p_user_id,v_org,'active',now(),p_expires_at,v_admin,
    coalesce(nullif(trim(p_note),''),'Re-enabled by EYA Admin')
  ) returning * into v_grant;

  perform public.set_temporary_organizer_auth_ban(p_user_id,false);
  return jsonb_build_object(
    'ok',true,
    'grant_id',v_grant.id,
    'user_id',v_grant.user_id,
    'organization_name',v_grant.organization_name,
    'status',v_grant.status,
    'starts_at',v_grant.starts_at,
    'expires_at',v_grant.expires_at
  );
end;
$$;

revoke all on function public.admin_regrant_ticket_organizer_access(uuid,timestamptz,text) from public,anon;
grant execute on function public.admin_regrant_ticket_organizer_access(uuid,timestamptz,text) to authenticated;
