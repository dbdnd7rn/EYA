begin;

create table if not exists public.vac_payment_events (
  id uuid primary key default gen_random_uuid(),
  idempotency_key text not null unique,
  event_type text not null check (event_type = 'payment.paid'),
  payment_intent_id text not null,
  app_id text not null check (app_id = 'eya'),
  app_payment_id text not null,
  app_user_id text,
  purpose text not null,
  merchant_reference text not null,
  amount_mwk bigint not null check (amount_mwk > 0),
  currency text not null check (currency = 'MWK'),
  verified_at timestamptz not null,
  metadata jsonb not null default '{}'::jsonb,
  payload jsonb not null,
  fulfilment jsonb not null default '{}'::jsonb,
  status text not null default 'received' check (
    status in ('received', 'processing', 'processed', 'failed')
  ),
  error_message text,
  received_at timestamptz not null default now(),
  processed_at timestamptz
);

create index if not exists vac_payment_events_app_payment_idx
  on public.vac_payment_events (app_payment_id, received_at desc);

create index if not exists vac_payment_events_status_idx
  on public.vac_payment_events (status, received_at);

alter table public.vac_payment_events enable row level security;

revoke all on table public.vac_payment_events from public, anon, authenticated;
grant select, insert, update on table public.vac_payment_events to service_role;

create or replace function public.process_vac_payment_event(
  p_idempotency_key text,
  p_event_type text,
  p_payment_intent_id text,
  p_app_id text,
  p_app_payment_id text,
  p_app_user_id text,
  p_purpose text,
  p_merchant_reference text,
  p_amount_mwk bigint,
  p_currency text,
  p_verified_at timestamptz,
  p_metadata jsonb,
  p_payload jsonb
)
returns table (
  event_id uuid,
  inserted boolean,
  current_status text,
  fulfilled boolean,
  fulfilment jsonb
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_event public.vac_payment_events%rowtype;
  v_inserted boolean := false;
  v_order_id_text text;
  v_metadata_order_id text;
  v_metadata_related_order_id text;
  v_metadata_user_id text;
  v_order_id uuid;
  v_order public.ticket_orders%rowtype;
  v_fulfilment jsonb := '{}'::jsonb;
  v_fulfilled boolean := false;
begin
  if nullif(btrim(p_idempotency_key), '') is null then
    raise exception 'idempotency key is required';
  end if;
  if p_event_type <> 'payment.paid' then
    raise exception 'unsupported payment event type';
  end if;
  if p_app_id <> 'eya' then
    raise exception 'invalid application id';
  end if;
  if nullif(btrim(p_payment_intent_id), '') is null
     or nullif(btrim(p_app_payment_id), '') is null
     or nullif(btrim(p_purpose), '') is null
     or nullif(btrim(p_merchant_reference), '') is null then
    raise exception 'payment event identifiers are required';
  end if;
  if p_idempotency_key <> p_event_type || ':' || p_payment_intent_id then
    raise exception 'idempotency key does not match the payment event';
  end if;
  if p_amount_mwk is null or p_amount_mwk <= 0 then
    raise exception 'invalid payment amount';
  end if;
  if p_currency <> 'MWK' then
    raise exception 'invalid payment currency';
  end if;
  if p_verified_at is null then
    raise exception 'verified_at is required';
  end if;
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    raise exception 'payment payload must be a JSON object';
  end if;
  if p_metadata is not null and jsonb_typeof(p_metadata) <> 'object' then
    raise exception 'payment metadata must be a JSON object';
  end if;

  insert into public.vac_payment_events (
    idempotency_key,
    event_type,
    payment_intent_id,
    app_id,
    app_payment_id,
    app_user_id,
    purpose,
    merchant_reference,
    amount_mwk,
    currency,
    verified_at,
    metadata,
    payload
  ) values (
    p_idempotency_key,
    p_event_type,
    p_payment_intent_id,
    p_app_id,
    p_app_payment_id,
    nullif(btrim(p_app_user_id), ''),
    p_purpose,
    p_merchant_reference,
    p_amount_mwk,
    p_currency,
    p_verified_at,
    coalesce(p_metadata, '{}'::jsonb),
    p_payload
  )
  on conflict (idempotency_key) do nothing
  returning * into v_event;

  if found then
    v_inserted := true;
  else
    select *
      into strict v_event
      from public.vac_payment_events
     where idempotency_key = p_idempotency_key
     for update;

    if v_event.event_type <> p_event_type
       or v_event.payment_intent_id <> p_payment_intent_id
       or v_event.app_id <> p_app_id
       or v_event.app_payment_id <> p_app_payment_id
       or coalesce(v_event.app_user_id, '') <> coalesce(nullif(btrim(p_app_user_id), ''), '')
       or v_event.purpose <> p_purpose
       or v_event.merchant_reference <> p_merchant_reference
       or v_event.amount_mwk <> p_amount_mwk
       or v_event.currency <> p_currency
       or v_event.verified_at <> p_verified_at
       or v_event.metadata <> coalesce(p_metadata, '{}'::jsonb)
       or v_event.payload <> p_payload then
      raise exception 'idempotency key conflicts with a different payment event';
    end if;
  end if;

  if v_event.status = 'processed' then
    return query
      select
        v_event.id,
        v_inserted,
        v_event.status,
        coalesce((v_event.fulfilment->>'finalized')::boolean, false),
        v_event.fulfilment;
    return;
  end if;

  update public.vac_payment_events
     set status = 'processing',
         error_message = null
   where id = v_event.id;

  if p_purpose = 'ticket_order' then
    v_order_id_text := nullif(btrim(p_app_payment_id), '');
    v_metadata_order_id := nullif(btrim(coalesce(p_metadata->>'ticket_order_id', '')), '');
    v_metadata_related_order_id := nullif(btrim(coalesce(p_metadata->>'related_order_id', '')), '');
    v_metadata_user_id := nullif(btrim(coalesce(p_metadata->>'user_id', '')), '');

    if v_order_id_text is null
       or v_order_id_text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
      raise exception 'ticket payment app_payment_id must be a valid ticket order id';
    end if;

    if v_metadata_order_id is not null and v_metadata_order_id <> v_order_id_text then
      raise exception 'ticket_order_id metadata does not match app_payment_id';
    end if;
    if v_metadata_related_order_id is not null and v_metadata_related_order_id <> v_order_id_text then
      raise exception 'related_order_id metadata does not match app_payment_id';
    end if;

    if nullif(btrim(p_app_user_id), '') is null
       or btrim(p_app_user_id) !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
      raise exception 'ticket payment app_user_id must be a valid user id';
    end if;
    if v_metadata_user_id is not null and v_metadata_user_id <> btrim(p_app_user_id) then
      raise exception 'ticket payment user metadata does not match app_user_id';
    end if;

    v_order_id := v_order_id_text::uuid;

    select *
      into v_order
      from public.ticket_orders
     where id = v_order_id
     for update;

    if not found then
      raise exception 'ticket order not found';
    end if;

    if v_order.user_id::text <> btrim(p_app_user_id) then
      raise exception 'ticket payment user does not match the reserved order';
    end if;

    if v_order.total_mwk <> p_amount_mwk::numeric then
      raise exception 'ticket payment amount does not match the reserved order';
    end if;

    if v_order.payment_reference is not null
       and v_order.payment_reference <> p_merchant_reference then
      raise exception 'ticket order belongs to a different payment reference';
    end if;

    select public.issue_ticket_order(
      v_order_id,
      null::uuid,
      p_merchant_reference,
      p_verified_at
    ) into v_fulfilment;

    v_fulfilled := coalesce((v_fulfilment->>'finalized')::boolean, false);
  else
    v_fulfilment := jsonb_build_object(
      'finalized', false,
      'handled', false,
      'message', 'Payment purpose is recorded but has no fulfilment handler yet.'
    );
  end if;

  update public.vac_payment_events
     set status = 'processed',
         fulfilment = v_fulfilment,
         error_message = null,
         processed_at = now()
   where id = v_event.id
   returning * into v_event;

  return query
    select v_event.id, v_inserted, v_event.status, v_fulfilled, v_event.fulfilment;
end;
$$;

revoke execute on function public.process_vac_payment_event(
  text, text, text, text, text, text, text, text, bigint, text, timestamptz, jsonb, jsonb
) from public, anon, authenticated;

grant execute on function public.process_vac_payment_event(
  text, text, text, text, text, text, text, text, bigint, text, timestamptz, jsonb, jsonb
) to service_role;

commit;