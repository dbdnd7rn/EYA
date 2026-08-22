-- Expose only the caller's finance access state so clients can render
-- suspended workspaces read-only. Authorization remains enforced by RPCs.
create or replace function public.get_my_ticket_event_finance(p_event_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_event public.ticket_events%rowtype;
  v_entitlement public.ticket_organization_finance_entitlements%rowtype;
  v_snapshot jsonb;
  v_requests jsonb;
begin
  if v_user is null then raise exception 'Authentication required.'; end if;
  select * into v_event from public.ticket_events where id=p_event_id;
  if not found or v_event.organization_id is null then raise exception 'Organization event not found.'; end if;

  select * into v_entitlement
  from public.ticket_organization_finance_entitlements
  where user_id=v_user and organization_id=v_event.organization_id
    and status in ('active','suspended')
  order by case status when 'active' then 0 else 1 end, created_at
  limit 1;
  if not found then raise exception 'Organization finance access required.'; end if;

  v_snapshot := public.ticket_event_finance_snapshot(p_event_id);
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',r.id,'request_type',r.request_type,'requested_amount_mwk',r.requested_amount_mwk,
    'approved_amount_mwk',r.approved_amount_mwk,'status',r.status,'requested_at',r.requested_at,
    'requested_by',r.organizer_id,'reviewed_at',r.reviewed_at,'review_note',r.review_note,
    'paid_at',r.paid_at,'payout_method',r.payout_method,'payout_reference',r.payout_reference
  ) order by r.requested_at desc),'[]'::jsonb)
  into v_requests
  from public.ticket_event_payout_requests r
  where r.event_id=p_event_id and r.organization_id=v_event.organization_id;

  return v_snapshot || jsonb_build_object(
    'organization_id',v_event.organization_id,
    'finance_entitlement_id',v_entitlement.id,
    'finance_entitlement_status',v_entitlement.status,
    'requests',v_requests
  );
end;
$$;

revoke all on function public.get_my_ticket_event_finance(uuid) from public, anon;
grant execute on function public.get_my_ticket_event_finance(uuid) to authenticated, service_role;
