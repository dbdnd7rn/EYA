begin;

-- Keep the EYA ticket payment audit row synchronized with the trusted
-- payment metadata received from the signed VAC Payments callback.
--
-- Payment verification and ticket issuance remain unchanged. This function
-- only records the VAC payment method and VAC payment-intent identifier in
-- public.ticket_payments after a payment event has been successfully processed.

create or replace function public.sync_vac_ticket_payment_audit_from_event()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_method text;
begin
  if new.status <> 'processed'
     or new.purpose <> 'ticket_order' then
    return new;
  end if;

  v_method := nullif(
    btrim(coalesce(new.metadata->>'payment_method', '')),
    ''
  );

  if v_method is not null
     and v_method not in (
       'airtel_money',
       'mpamba',
       'bank_transfer',
       'card'
     ) then
    raise exception 'Unsupported VAC ticket payment method: %', v_method;
  end if;

  update public.ticket_payments tp
  set
    method = coalesce(tp.method, v_method),
    provider_payload =
      coalesce(tp.provider_payload, '{}'::jsonb)
      ||
      jsonb_strip_nulls(
        jsonb_build_object(
          'payment_intent_id', new.payment_intent_id,
          'method', v_method
        )
      ),
    updated_at = now()
  where tp.order_id::text = new.app_payment_id
    and tp.reference = new.merchant_reference;

  return new;
end;
$$;

revoke all on function public.sync_vac_ticket_payment_audit_from_event()
  from public, anon, authenticated;

drop trigger if exists trg_sync_vac_ticket_payment_audit
  on public.vac_payment_events;

create trigger trg_sync_vac_ticket_payment_audit
after insert or update of status, metadata, payment_intent_id
on public.vac_payment_events
for each row
when (
  new.status = 'processed'
  and new.purpose = 'ticket_order'
)
execute function public.sync_vac_ticket_payment_audit_from_event();

-- Backfill already-processed VAC ticket payments, including the successful
-- Airtel Money transaction used during the current integration test.
update public.ticket_payments tp
set
  method = coalesce(
    tp.method,
    nullif(btrim(vpe.metadata->>'payment_method'), '')
  ),
  provider_payload =
    coalesce(tp.provider_payload, '{}'::jsonb)
    ||
    jsonb_build_object(
      'payment_intent_id', vpe.payment_intent_id,
      'method', vpe.metadata->>'payment_method'
    ),
  updated_at = now()
from public.vac_payment_events vpe
where vpe.status = 'processed'
  and vpe.purpose = 'ticket_order'
  and vpe.metadata->>'payment_method' in (
    'airtel_money',
    'mpamba',
    'bank_transfer',
    'card'
  )
  and tp.order_id::text = vpe.app_payment_id
  and tp.reference = vpe.merchant_reference;

commit;
