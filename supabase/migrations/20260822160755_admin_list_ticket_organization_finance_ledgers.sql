create or replace function public.admin_list_ticket_organization_finance_ledgers()
returns jsonb language plpgsql security definer set search_path=public,auth,pg_temp as $$
declare v_rows jsonb;
begin
  if auth.uid() is null or not public.is_admin() then raise exception 'Admin access required.'; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'organization_id',o.id,
    'organization_name',o.name,
    'organization_status',o.status,
    'liability_balance_mwk',public.ticket_organization_liability_balance(o.id),
    'entry_count',(select count(*) from public.ticket_organization_finance_ledger l where l.organization_id=o.id),
    'last_entry_at',(select max(l.posted_at) from public.ticket_organization_finance_ledger l where l.organization_id=o.id)
  ) order by public.ticket_organization_liability_balance(o.id) desc,o.name),'[]'::jsonb)
  into v_rows from public.ticket_organizer_organizations o;
  return v_rows;
end;
$$;

revoke all on function public.admin_list_ticket_organization_finance_ledgers() from public,anon;
grant execute on function public.admin_list_ticket_organization_finance_ledgers() to authenticated,service_role;
