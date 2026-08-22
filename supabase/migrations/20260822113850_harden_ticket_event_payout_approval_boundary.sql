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
  if public.current_ticket_organizer_grant(v_user) is null then
    raise exception 'Temporary Organizer Workspace access is expired or revoked.';
  end if;

  select * into v_event from public.ticket_events where id = p_event_id for update;
  if not found or v_event.organizer_id is distinct from v_user then
    raise exception 'Organizer event not found.';
  end if;
  if v_event.approved_version_id is null or v_event.approved_version_number is null then
    raise exception 'Only an EYA-approved organizer event can request payouts.';
  end if;

  select * into v_controls from public.ticket_event_finance_controls where event_id = p_event_id for update;
  if not found then raise exception 'EYA has not configured payout controls for this event yet.'; end if;
  if v_controls.status <> 'open' then raise exception 'Payouts for this event are currently %.', v_controls.status; end if;

  if exists (
    select 1 from public.ticket_event_payout_requests
    where event_id = p_event_id and status in ('pending','approved')
  ) then
    raise exception 'This event already has an open payout request.';
  end if;

  v_snapshot := public.ticket_event_finance_snapshot(p_event_id);
  v_available := coalesce((v_snapshot->>'available_for_payout_mwk')::numeric,0);
  if v_available <= 0 then raise exception 'No event funds are currently available for payout.'; end if;

  if v_type = 'early_payout' then
    if v_event.status <> 'published' then raise exception 'Early payout is available only while the event is published.'; end if;
    if coalesce((v_snapshot->>'event_finished')::boolean,false) then
      raise exception 'This event has finished. Request final settlement instead.';
    end if;
    if p_requested_amount_mwk is null or p_requested_amount_mwk <= 0 or p_requested_amount_mwk <> trunc(p_requested_amount_mwk) then
      raise exception 'Enter a whole-MWK early payout amount greater than zero.';
    end if;
    if p_requested_amount_mwk > v_available then
      raise exception 'Requested amount exceeds the currently eligible early payout amount.';
    end if;
    v_amount := p_requested_amount_mwk;
  elsif v_type = 'final_settlement' then
    if not coalesce((v_snapshot->>'event_finished')::boolean,false) then
      raise exception 'Final settlement is available only after the event has finished.';
    end if;
    if not coalesce((v_snapshot->>'final_settlement_ready')::boolean,false) then
      raise exception 'Final settlement is not ready. EYA must clear the refund reserve and any manual hold first.';
    end if;
    v_amount := trunc(v_available);
    if v_amount <= 0 then raise exception 'No funds remain for final settlement.'; end if;
  else
    raise exception 'request_type must be early_payout or final_settlement.';
  end if;

  insert into public.ticket_event_payout_requests(
    event_id, organizer_id, request_type, requested_amount_mwk, metadata
  ) values (
    p_event_id, v_user, v_type, v_amount,
    jsonb_build_object('finance_snapshot_at_request', v_snapshot)
  ) returning * into v_request;

  return jsonb_build_object(
    'ok', true,
    'request_id', v_request.id,
    'request_type', v_request.request_type,
    'requested_amount_mwk', v_request.requested_amount_mwk,
    'status', v_request.status
  );
end;
$$;

create or replace function public.admin_set_ticket_event_finance_controls(
  p_event_id uuid,
  p_reserve_required_mwk numeric,
  p_platform_fee_mwk numeric,
  p_other_hold_mwk numeric default 0,
  p_status text default 'open',
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_admin uuid := auth.uid();
  v_event public.ticket_events%rowtype;
  v_existing public.ticket_event_finance_controls%rowtype;
  v_previous jsonb;
  v_new public.ticket_event_finance_controls%rowtype;
  v_status text := lower(trim(coalesce(p_status,'open')));
begin
  if v_admin is null or not public.is_admin() then raise exception 'Admin access required.'; end if;

  select * into v_event from public.ticket_events where id=p_event_id;
  if not found or v_event.organizer_id is null then raise exception 'Organizer-owned event not found.'; end if;
  if v_event.approved_version_id is null or v_event.approved_version_number is null then
    raise exception 'Finance controls can be configured only after EYA approves the organizer event + tickets.';
  end if;
  if v_event.status not in ('published','paused','archived','cancelled') then
    raise exception 'This organizer event is not in a finance-manageable status.';
  end if;

  if p_reserve_required_mwk is null or p_reserve_required_mwk < 0 or p_reserve_required_mwk <> trunc(p_reserve_required_mwk)
     or p_platform_fee_mwk is null or p_platform_fee_mwk < 0 or p_platform_fee_mwk <> trunc(p_platform_fee_mwk)
     or p_other_hold_mwk is null or p_other_hold_mwk < 0 or p_other_hold_mwk <> trunc(p_other_hold_mwk) then
    raise exception 'Finance control amounts must be whole-MWK values of zero or more.';
  end if;
  if v_status not in ('open','frozen') then raise exception 'Admin finance status must be open or frozen. Settled is set only by completed final settlement.'; end if;

  select * into v_existing from public.ticket_event_finance_controls where event_id=p_event_id for update;
  if found then
    if v_existing.status = 'settled' then raise exception 'A settled event finance account cannot be reopened through this control.'; end if;
    v_previous := to_jsonb(v_existing);
  else
    v_previous := null;
  end if;

  insert into public.ticket_event_finance_controls(
    event_id, organizer_id, reserve_required_mwk, platform_fee_mwk, other_hold_mwk,
    status, admin_note, updated_by, updated_at
  ) values (
    p_event_id, v_event.organizer_id, p_reserve_required_mwk, p_platform_fee_mwk, p_other_hold_mwk,
    v_status, nullif(trim(p_note),''), v_admin, now()
  )
  on conflict (event_id) do update set
    organizer_id=excluded.organizer_id,
    reserve_required_mwk=excluded.reserve_required_mwk,
    platform_fee_mwk=excluded.platform_fee_mwk,
    other_hold_mwk=excluded.other_hold_mwk,
    status=excluded.status,
    admin_note=excluded.admin_note,
    updated_by=excluded.updated_by,
    updated_at=now()
  returning * into v_new;

  insert into public.ticket_event_finance_control_log(event_id,actor_id,action,previous_state,new_state,note)
  values (p_event_id,v_admin,case when v_previous is null then 'configured' else 'updated' end,v_previous,to_jsonb(v_new),nullif(trim(p_note),''));

  return public.ticket_event_finance_snapshot(p_event_id);
end;
$$;

revoke all on function public.request_my_ticket_event_payout(uuid,text,numeric) from public, anon;
revoke all on function public.admin_set_ticket_event_finance_controls(uuid,numeric,numeric,numeric,text,text) from public, anon;
grant execute on function public.request_my_ticket_event_payout(uuid,text,numeric) to authenticated;
grant execute on function public.admin_set_ticket_event_finance_controls(uuid,numeric,numeric,numeric,text,text) to authenticated;
