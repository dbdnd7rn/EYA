create or replace function public.admin_list_ticket_organization_events(p_organization_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path=public,auth,pg_temp
as $$
declare v_rows jsonb;
begin
  if auth.uid() is null or not public.is_admin() then raise exception 'Admin access required.'; end if;
  if not exists(select 1 from public.ticket_organizer_organizations where id=p_organization_id) then raise exception 'Ticket organization not found.'; end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'event_id',e.id,
    'event_title',e.title,
    'event_status',e.status,
    'starts_at',e.starts_at,
    'ends_at',e.ends_at
  ) order by coalesce(e.ends_at,e.starts_at,e.created_at) desc),'[]'::jsonb)
  into v_rows
  from public.ticket_events e
  where e.organization_id=p_organization_id;

  return v_rows;
end;
$$;

revoke all on function public.admin_list_ticket_organization_events(uuid) from public,anon;
grant execute on function public.admin_list_ticket_organization_events(uuid) to authenticated,service_role;
