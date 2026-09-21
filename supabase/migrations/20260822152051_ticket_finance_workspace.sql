create or replace function public.get_my_ticket_finance_workspace()
returns jsonb
language sql
stable
security definer
set search_path = public, auth, pg_temp
as $$
  select case when auth.uid() is null then '[]'::jsonb else coalesce(jsonb_agg(
    jsonb_build_object(
      'entitlement_id',f.id,
      'organization_id',o.id,
      'organization_name',o.name,
      'role',f.role,
      'status',f.status,
      'events',coalesce((
        select jsonb_agg(
          public.ticket_event_finance_snapshot(e.id)
          order by coalesce(e.ends_at,e.starts_at,e.created_at) desc
        )
        from public.ticket_events e
        where e.organization_id=o.id
          and e.approved_version_id is not null
      ),'[]'::jsonb)
    ) order by o.name
  ),'[]'::jsonb) end
  from public.ticket_organization_finance_entitlements f
  join public.ticket_organizer_organizations o on o.id=f.organization_id and o.status='active'
  where f.user_id=auth.uid() and f.status in ('active','suspended')
$$;

revoke all on function public.get_my_ticket_finance_workspace() from public, anon;
grant execute on function public.get_my_ticket_finance_workspace() to authenticated, service_role;
