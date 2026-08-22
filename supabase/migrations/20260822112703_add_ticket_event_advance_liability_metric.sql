create or replace function public.ticket_event_finance_snapshot(p_event_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_event public.ticket_events%rowtype;
  v_controls public.ticket_event_finance_controls%rowtype;
  v_has_controls boolean := false;
  v_gross_sales numeric(14,2) := 0;
  v_active_paid_sales numeric(14,2) := 0;
  v_refunded_sales numeric(14,2) := 0;
  v_service_fees_paid numeric(14,2) := 0;
  v_paid_out numeric(14,2) := 0;
  v_approved_unpaid numeric(14,2) := 0;
  v_net_before_payout numeric(14,2) := 0;
  v_available numeric(14,2) := 0;
  v_liability numeric(14,2) := 0;
  v_finished boolean := false;
  v_final_ready boolean := false;
begin
  select * into v_event from public.ticket_events where id = p_event_id;
  if not found then raise exception 'Event not found.'; end if;

  select * into v_controls from public.ticket_event_finance_controls where event_id = p_event_id;
  v_has_controls := found;

  select
    coalesce(sum(case when payment_status in ('paid','refunded') then unit_price_mwk * quantity else 0 end),0),
    coalesce(sum(case when payment_status = 'paid' then unit_price_mwk * quantity else 0 end),0),
    coalesce(sum(case when payment_status = 'refunded' then unit_price_mwk * quantity else 0 end),0),
    coalesce(sum(case when payment_status = 'paid' then service_fee_mwk else 0 end),0)
  into v_gross_sales, v_active_paid_sales, v_refunded_sales, v_service_fees_paid
  from public.ticket_orders
  where event_id = p_event_id;

  select
    coalesce(sum(case when status='paid' then approved_amount_mwk else 0 end),0),
    coalesce(sum(case when status='approved' then approved_amount_mwk else 0 end),0)
  into v_paid_out, v_approved_unpaid
  from public.ticket_event_payout_requests
  where event_id = p_event_id;

  v_finished := coalesce(v_event.ends_at, v_event.starts_at) is not null
    and coalesce(v_event.ends_at, v_event.starts_at) <= now();

  if v_has_controls then
    v_net_before_payout := greatest(
      v_active_paid_sales
      - v_controls.platform_fee_mwk
      - v_controls.reserve_required_mwk
      - v_controls.other_hold_mwk,
      0
    );
    v_liability := greatest((v_paid_out + v_approved_unpaid) - v_net_before_payout, 0);
  else
    v_net_before_payout := 0;
    v_liability := 0;
  end if;

  if v_has_controls and v_controls.status = 'open' and v_liability = 0 then
    v_available := greatest(v_net_before_payout - v_paid_out - v_approved_unpaid, 0);
  else
    v_available := 0;
  end if;

  v_final_ready := v_has_controls
    and v_controls.status = 'open'
    and v_liability = 0
    and v_finished
    and v_event.status in ('published','paused','archived')
    and v_controls.reserve_required_mwk = 0
    and v_controls.other_hold_mwk = 0;

  return jsonb_build_object(
    'event_id', v_event.id,
    'event_title', v_event.title,
    'event_status', v_event.status,
    'organizer_id', v_event.organizer_id,
    'starts_at', v_event.starts_at,
    'ends_at', v_event.ends_at,
    'event_finished', v_finished,
    'payouts_configured', v_has_controls,
    'finance_status', case when v_has_controls then v_controls.status else 'unconfigured' end,
    'gross_ticket_sales_mwk', v_gross_sales,
    'active_paid_ticket_sales_mwk', v_active_paid_sales,
    'refunded_ticket_sales_mwk', v_refunded_sales,
    'service_fees_paid_mwk', v_service_fees_paid,
    'platform_fee_mwk', case when v_has_controls then v_controls.platform_fee_mwk else 0 end,
    'protected_refund_reserve_mwk', case when v_has_controls then v_controls.reserve_required_mwk else 0 end,
    'other_hold_mwk', case when v_has_controls then v_controls.other_hold_mwk else 0 end,
    'net_event_funds_before_payout_mwk', v_net_before_payout,
    'paid_out_mwk', v_paid_out,
    'approved_unpaid_mwk', v_approved_unpaid,
    'organizer_advance_liability_mwk', v_liability,
    'available_for_payout_mwk', v_available,
    'final_settlement_ready', v_final_ready
  );
end;
$$;

revoke all on function public.ticket_event_finance_snapshot(uuid) from public, anon, authenticated;
grant execute on function public.ticket_event_finance_snapshot(uuid) to service_role;
