alter table public.ticket_event_payout_requests
  drop constraint if exists ticket_event_payout_requests_payout_method_check;

alter table public.ticket_event_payout_requests
  add constraint ticket_event_payout_requests_payout_method_check
  check (payout_method is null or payout_method in ('airtel_money','mpamba','bank'));

create or replace function public.admin_record_ticket_event_payout_paid(
  p_request_id uuid,
  p_payout_method text,
  p_payout_reference text
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_admin uuid := auth.uid();
  v_request public.ticket_event_payout_requests%rowtype;
  v_method text := lower(trim(coalesce(p_payout_method,'')));
  v_snapshot jsonb;
  v_remaining numeric(14,2);
  v_controls public.ticket_event_finance_controls%rowtype;
begin
  if v_admin is null or not public.is_admin() then raise exception 'Admin access required.'; end if;
  if v_method not in ('airtel_money','mpamba','bank') then raise exception 'Unsupported payout method.'; end if;
  if nullif(trim(p_payout_reference),'') is null then raise exception 'A payout provider reference is required.'; end if;

  select * into v_request from public.ticket_event_payout_requests where id=p_request_id for update;
  if not found then raise exception 'Payout request not found.'; end if;
  if v_request.status <> 'approved' or v_request.approved_amount_mwk is null then
    raise exception 'Only an approved payout can be recorded as paid.';
  end if;

  update public.ticket_event_payout_requests
  set status='paid', paid_at=now(), payout_method=v_method, payout_reference=trim(p_payout_reference), updated_at=now()
  where id=p_request_id;

  v_snapshot := public.ticket_event_finance_snapshot(v_request.event_id);
  v_remaining := coalesce((v_snapshot->>'available_for_payout_mwk')::numeric,0);

  if v_request.request_type='final_settlement'
     and coalesce((v_snapshot->>'event_finished')::boolean,false)
     and v_remaining <= 0 then
    select * into v_controls from public.ticket_event_finance_controls where event_id=v_request.event_id for update;
    if found and v_controls.reserve_required_mwk=0 and v_controls.other_hold_mwk=0 then
      update public.ticket_event_finance_controls
      set status='settled', updated_by=v_admin, updated_at=now()
      where event_id=v_request.event_id;
      insert into public.ticket_event_finance_control_log(event_id,actor_id,action,previous_state,new_state,note)
      values (
        v_request.event_id,
        v_admin,
        'final_settlement_paid',
        to_jsonb(v_controls),
        to_jsonb((select c from public.ticket_event_finance_controls c where c.event_id=v_request.event_id)),
        'Final settlement payout recorded as paid.'
      );
    end if;
  end if;

  return jsonb_build_object('ok',true,'request_id',p_request_id,'status','paid','finance',public.ticket_event_finance_snapshot(v_request.event_id));
end;
$$;

revoke all on function public.admin_record_ticket_event_payout_paid(uuid,text,text) from public, anon;
grant execute on function public.admin_record_ticket_event_payout_paid(uuid,text,text) to authenticated;
