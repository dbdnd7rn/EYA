create or replace function public.admin_list_ticket_organization_payout_destinations()
returns jsonb
language sql
stable
security definer
set search_path = public, auth, pg_temp
as $$
  select case when public.is_admin() then coalesce(jsonb_agg(jsonb_build_object(
    'id',d.id,'organization_id',d.organization_id,'organization_name',o.name,
    'method',d.method,'beneficiary_name',d.beneficiary_name,'bank_or_network',d.bank_or_network,
    'masked_destination',d.masked_destination,'status',d.status,'is_primary',d.is_primary,
    'created_by',d.created_by,'verified_at',d.verified_at,'review_note',d.review_note,
    'created_at',d.created_at
  ) order by case d.status when 'pending_verification' then 0 else 1 end,d.created_at desc),'[]'::jsonb)
  else '[]'::jsonb end
  from public.ticket_organization_payout_destinations d
  join public.ticket_organizer_organizations o on o.id=d.organization_id
$$;

revoke all on function public.admin_list_ticket_organization_payout_destinations() from public,anon;
grant execute on function public.admin_list_ticket_organization_payout_destinations() to authenticated,service_role;
