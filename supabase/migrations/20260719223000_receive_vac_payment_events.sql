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

create or replace function public.record_vac_payment_event(
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
  current_status text
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_event public.vac_payment_events%rowtype;
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
  if p_amount_mwk is null or p_amount_mwk <= 0 then
    raise exception 'invalid payment amount';
  end if;
  if p_currency <> 'MWK' then
    raise exception 'invalid payment currency';
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
    return query select v_event.id, true, v_event.status;
    return;
  end if;

  select *
    into strict v_event
    from public.vac_payment_events
   where idempotency_key = p_idempotency_key;

  if v_event.event_type <> p_event_type
     or v_event.payment_intent_id <> p_payment_intent_id
     or v_event.app_payment_id <> p_app_payment_id
     or v_event.merchant_reference <> p_merchant_reference
     or v_event.amount_mwk <> p_amount_mwk
     or v_event.currency <> p_currency then
    raise exception 'idempotency key conflicts with a different payment event';
  end if;

  return query select v_event.id, false, v_event.status;
end;
$$;

revoke execute on function public.record_vac_payment_event(
  text, text, text, text, text, text, text, text, bigint, text, timestamptz, jsonb, jsonb
) from public, anon, authenticated;

grant execute on function public.record_vac_payment_event(
  text, text, text, text, text, text, text, text, bigint, text, timestamptz, jsonb, jsonb
) to service_role;

commit;
