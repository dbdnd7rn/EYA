begin;

-- VAC ticket fulfilment must not depend on the generic public.payments table.
-- The payment identity is authoritative in VAC/Cloudflare D1; Supabase keeps
-- payment_id nullable and binds fulfilment by the verified merchant reference.
--
-- pgcrypto is installed in Supabase's extensions schema. This SECURITY DEFINER
-- function deliberately keeps a narrow search_path, so pgcrypto calls are
-- schema-qualified instead of broadening search_path.
create or replace function public.issue_ticket_order(
  p_order_id uuid,
  p_payment_id uuid,
  p_payment_reference text,
  p_paid_at timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_order public.ticket_orders%rowtype;
  v_tier public.ticket_tiers%rowtype;
  v_item public.ticket_order_items%rowtype;
  v_has_reserved_capacity boolean;
  v_available integer;
  v_index integer;
  v_ticket_code text;
  v_qr_token text;
  v_tickets jsonb;
begin
  select * into v_order
  from public.ticket_orders
  where id = p_order_id
  for update;

  if not found then
    raise exception 'Ticket order not found.';
  end if;

  select * into v_tier
  from public.ticket_tiers
  where id = v_order.tier_id
  for update;

  if not found then
    raise exception 'Ticket tier not found.';
  end if;

  select * into v_item
  from public.ticket_order_items
  where order_id = v_order.id
  order by created_at asc
  limit 1;

  if not found then
    raise exception 'Ticket order item not found.';
  end if;

  if v_order.status = 'paid' then
    select coalesce(jsonb_agg(to_jsonb(t) order by t.issued_at asc), '[]'::jsonb)
    into v_tickets
    from public.issued_tickets t
    where t.order_id = v_order.id;

    return jsonb_build_object(
      'order', to_jsonb(v_order),
      'tickets', coalesce(v_tickets, '[]'::jsonb),
      'finalized', true
    );
  end if;

  -- pending/awaiting_payment means this order still owns reserved capacity.
  -- Do not use reserved_until here: an expired timestamp can exist before the
  -- reservation-release job has actually decremented capacity_reserved.
  v_has_reserved_capacity := v_order.status in ('pending', 'awaiting_payment');

  if not v_has_reserved_capacity then
    v_available := v_tier.capacity_total - v_tier.capacity_sold - v_tier.capacity_reserved;
    if v_available < v_order.quantity then
      update public.ticket_orders
      set status = 'payment_review',
          payment_status = 'paid',
          payment_id = p_payment_id,
          payment_reference = p_payment_reference,
          paid_at = coalesce(p_paid_at, now()),
          updated_at = now()
      where id = v_order.id
      returning * into v_order;

      insert into public.ticket_payments (
        order_id,
        payment_id,
        provider,
        method,
        reference,
        amount_mwk,
        status
      ) values (
        v_order.id,
        p_payment_id,
        'paychangu',
        null,
        coalesce(nullif(p_payment_reference, ''), v_order.payment_reference, v_order.id::text),
        v_order.total_mwk,
        'paid'
      )
      on conflict (order_id, reference)
      do update set
        payment_id = excluded.payment_id,
        amount_mwk = excluded.amount_mwk,
        status = 'paid',
        updated_at = now();

      return jsonb_build_object(
        'order', to_jsonb(v_order),
        'tickets', '[]'::jsonb,
        'finalized', false,
        'message', 'Payment is paid but ticket stock needs admin review.'
      );
    end if;
  end if;

  update public.ticket_tiers
  set capacity_reserved = greatest(
        0,
        capacity_reserved - case when v_has_reserved_capacity then v_order.quantity else 0 end
      ),
      capacity_sold = capacity_sold + v_order.quantity,
      updated_at = now()
  where id = v_tier.id;

  update public.ticket_orders
  set status = 'paid',
      payment_status = 'paid',
      payment_id = p_payment_id,
      payment_reference = p_payment_reference,
      paid_at = coalesce(p_paid_at, now()),
      updated_at = now()
  where id = v_order.id
  returning * into v_order;

  insert into public.ticket_payments (
    order_id,
    payment_id,
    provider,
    method,
    reference,
    amount_mwk,
    status
  )
  values (
    v_order.id,
    p_payment_id,
    'paychangu',
    null,
    coalesce(nullif(p_payment_reference, ''), v_order.payment_reference, v_order.id::text),
    v_order.total_mwk,
    'paid'
  )
  on conflict (order_id, reference)
  do update set
    payment_id = excluded.payment_id,
    amount_mwk = excluded.amount_mwk,
    status = 'paid',
    updated_at = now();

  if not exists (
    select 1
    from public.issued_tickets
    where order_id = v_order.id
  ) then
    for v_index in 1..v_order.quantity loop
      v_ticket_code := 'EYA-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12));
      v_qr_token := v_order.id::text || ':' || v_ticket_code || ':' || encode(extensions.gen_random_bytes(16), 'hex');

      insert into public.issued_tickets (
        order_id,
        order_item_id,
        event_id,
        tier_id,
        user_id,
        ticket_code,
        qr_token_hash,
        metadata
      )
      values (
        v_order.id,
        v_item.id,
        v_order.event_id,
        v_order.tier_id,
        v_order.user_id,
        v_ticket_code,
        encode(extensions.digest(v_qr_token, 'sha256'), 'hex'),
        jsonb_build_object('ticket_index', v_index)
      );
    end loop;
  end if;

  select coalesce(jsonb_agg(to_jsonb(t) order by t.issued_at asc), '[]'::jsonb)
  into v_tickets
  from public.issued_tickets t
  where t.order_id = v_order.id;

  return jsonb_build_object(
    'order', to_jsonb(v_order),
    'tickets', coalesce(v_tickets, '[]'::jsonb),
    'finalized', true
  );
end;
$$;

revoke execute on function public.issue_ticket_order(uuid, uuid, text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.issue_ticket_order(uuid, uuid, text, timestamptz)
  to service_role;

commit;
