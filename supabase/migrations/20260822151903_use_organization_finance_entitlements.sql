-- Finance RPCs authorize against stable organization finance entitlement,
-- never temporary Ticket Management operations access.

create or replace function public.get_my_ticket_event_finance(p_event_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_event public.ticket_events%rowtype;
  v_snapshot jsonb;
  v_requests jsonb;
begin
  if v_user is null then raise exception 'Authentication required.'; end if;

  select * into v_event from public.ticket_events where id=p_event_id;
  if not found or v_event.organization_id is null then raise exception 'Organization event not found.'; end if;
  if public.current_ticket_finance_entitlement(v_user,v_event.organization_id,true) is null then
    raise exception 'Organization finance access required.';
  end if;

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
    'finance_entitlement_id',public.current_ticket_finance_entitlement(v_user,v_event.organization_id,true),
    'requests',v_requests
  );
end;
$$;

create or replace function public.request_my_ticket_event_payout(
  p_event_id uuid,
  p_request_type text,
  p_requested_amount_mwk numeric default null
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
  select * into v_event from public.ticket_events where id=p_event_id for update;
  if not found or v_event.organization_id is null then raise exception 'Organization event not found.'; end if;
  if public.current_ticket_finance_entitlement(v_user,v_event.organization_id,false) is null then
    raise exception 'Active organization finance access required.';
  end if;
  if v_event.approved_version_id is null or v_event.approved_version_number is null then
    raise exception 'Only an EYA-approved organizer event can request payouts.';
  end if;

  select * into v_controls from public.ticket_event_finance_controls where event_id=p_event_id for update;
  if not found then raise exception 'EYA has not configured payout controls for this event yet.'; end if;
  if v_controls.organization_id is distinct from v_event.organization_id then raise exception 'Event finance organization mismatch.'; end if;
  if v_controls.status <> 'open' then raise exception 'Payouts for this event are currently %.',v_controls.status; end if;
  if exists (
    select 1 from public.ticket_event_payout_requests
    where event_id=p_event_id and status in ('pending','approved')
  ) then raise exception 'This event already has an open payout request.'; end if;

  v_snapshot := public.ticket_event_finance_snapshot(p_event_id);
  v_available := coalesce((v_snapshot->>'available_for_payout_mwk')::numeric,0);
  if v_available <= 0 then raise exception 'No event funds are currently available for payout.'; end if;

  if v_type='early_payout' then
    if v_event.status <> 'published' then raise exception 'Early payout is available only while the event is published.'; end if;
    if coalesce((v_snapshot->>'event_finished')::boolean,false) then raise exception 'This event has finished. Request final settlement instead.'; end if;
    if p_requested_amount_mwk is null or p_requested_amount_mwk <= 0
       or p_requested_amount_mwk <> trunc(p_requested_amount_mwk) then
      raise exception 'Enter a whole-MWK early payout amount greater than zero.';
    end if;
    if p_requested_amount_mwk > v_available then raise exception 'Requested amount exceeds currently available funds.'; end if;
    v_amount := p_requested_amount_mwk;
  elsif v_type='final_settlement' then
    if not coalesce((v_snapshot->>'event_finished')::boolean,false) then raise exception 'Final settlement is available only after the event has finished.'; end if;
    if not coalesce((v_snapshot->>'final_settlement_ready')::boolean,false) then
      raise exception 'Final settlement is not ready. EYA must clear the refund reserve and any manual hold first.';
    end if;
    v_amount := trunc(v_available);
    if v_amount <= 0 then raise exception 'No funds remain for final settlement.'; end if;
  else
    raise exception 'request_type must be early_payout or final_settlement.';
  end if;

  insert into public.ticket_event_payout_requests(
    event_id,organization_id,organizer_id,request_type,requested_amount_mwk,metadata
  ) values (
    p_event_id,v_event.organization_id,v_user,v_type,v_amount,
    jsonb_build_object(
      'finance_snapshot_at_request',v_snapshot,
      'finance_entitlement_id',public.current_ticket_finance_entitlement(v_user,v_event.organization_id,false)
    )
  ) returning * into v_request;

  return jsonb_build_object(
    'ok',true,'request_id',v_request.id,'organization_id',v_request.organization_id,
    'requested_by',v_user,'request_type',v_request.request_type,
    'requested_amount_mwk',v_request.requested_amount_mwk,'status',v_request.status
  );
end;
$$;

create or replace function public.cancel_my_ticket_event_payout_request(p_request_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_request public.ticket_event_payout_requests%rowtype;
begin
  if v_user is null then raise exception 'Authentication required.'; end if;
  select * into v_request from public.ticket_event_payout_requests where id=p_request_id for update;
  if not found then raise exception 'Payout request not found.'; end if;
  if public.current_ticket_finance_entitlement(v_user,v_request.organization_id,false) is null then
    raise exception 'Active organization finance access required.';
  end if;
  if v_request.status <> 'pending' then raise exception 'Only a pending payout request can be cancelled.'; end if;

  update public.ticket_event_payout_requests
  set status='cancelled',updated_at=now(),
      metadata=metadata || jsonb_build_object('cancelled_by',v_user,'cancelled_at',now())
  where id=p_request_id;
  return jsonb_build_object('ok',true,'request_id',p_request_id,'status','cancelled','cancelled_by',v_user);
end;
$$;

revoke all on function public.get_my_ticket_event_finance(uuid) from public, anon;
revoke all on function public.request_my_ticket_event_payout(uuid,text,numeric) from public, anon;
revoke all on function public.cancel_my_ticket_event_payout_request(uuid) from public, anon;
grant execute on function public.get_my_ticket_event_finance(uuid) to authenticated, service_role;
grant execute on function public.request_my_ticket_event_payout(uuid,text,numeric) to authenticated, service_role;
grant execute on function public.cancel_my_ticket_event_payout_request(uuid) to authenticated, service_role;
