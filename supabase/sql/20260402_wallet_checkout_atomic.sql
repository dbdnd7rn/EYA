alter table public.payments
  drop constraint if exists payments_purpose_check;

alter table public.payments
  add constraint payments_purpose_check
  check (
    purpose = any (
      array[
        'subscription'::text,
        'verification'::text,
        'wallet_topup'::text,
        'campus_market_order'::text,
        'generic_checkout'::text,
        'wallet_order_payment'::text
      ]
    )
  );

create or replace function public.wallet_checkout_campus_market(
  p_user_id uuid,
  p_customer_email text,
  p_title text,
  p_description text,
  p_order jsonb
)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_wallet public.wallet_accounts%rowtype;
  v_vendor public.vendors%rowtype;
  v_order_id uuid;
  v_payment_id uuid;
  v_wallet_activity_id uuid;
  v_line jsonb;
  v_lines jsonb;
  v_item public.catalog_items%rowtype;
  v_item_id uuid;
  v_quantity integer;
  v_subtotal numeric := 0;
  v_delivery_fee numeric := 0;
  v_service_fee numeric := 0;
  v_total numeric := 0;
  v_total_int integer := 0;
  v_channel text;
  v_delivery_mode text;
  v_order_reference text;
  v_delivery_pin text;
  v_qr_token text;
  v_payment_reference text;
  v_customer_email text;
begin
  if p_user_id is null then
    raise exception 'Wallet checkout requires a valid user.';
  end if;

  if p_order is null or jsonb_typeof(p_order) <> 'object' then
    raise exception 'Wallet checkout is missing order details.';
  end if;

  v_lines := coalesce(p_order -> 'lines', '[]'::jsonb);
  if jsonb_typeof(v_lines) <> 'array' or jsonb_array_length(v_lines) = 0 then
    raise exception 'Wallet checkout must include at least one order line.';
  end if;

  v_channel := lower(trim(coalesce(p_order ->> 'channel', '')));
  if v_channel not in ('market', 'food') then
    raise exception 'Wallet checkout has an invalid order channel.';
  end if;

  v_delivery_mode := lower(trim(coalesce(nullif(p_order ->> 'delivery_mode', ''), 'pickup')));
  if v_delivery_mode not in ('pickup', 'doorstep') then
    raise exception 'Wallet checkout has an invalid delivery mode.';
  end if;

  select *
  into v_vendor
  from public.vendors
  where id = (p_order ->> 'vendor_id')::uuid
    and is_active = true;

  if not found then
    raise exception 'Wallet checkout vendor was not found.';
  end if;

  if v_channel = 'market' and coalesce(v_vendor.supports_market, false) = false then
    raise exception 'Vendor does not support market orders.';
  end if;

  if v_channel = 'food' and coalesce(v_vendor.supports_food, false) = false then
    raise exception 'Vendor does not support food orders.';
  end if;

  for v_line in
    select value
    from jsonb_array_elements(v_lines)
  loop
    begin
      v_item_id := (v_line ->> 'item_id')::uuid;
    exception
      when others then
        raise exception 'Wallet checkout has an invalid item id.';
    end;

    v_quantity := greatest(coalesce((v_line ->> 'quantity')::integer, 0), 0);
    if v_quantity <= 0 then
      raise exception 'Wallet checkout item quantity must be greater than zero.';
    end if;

    select *
    into v_item
    from public.catalog_items
    where id = v_item_id
      and is_active = true;

    if not found then
      raise exception 'Catalog item not found: %', v_item_id;
    end if;

    if v_item.vendor_id <> v_vendor.id then
      raise exception 'All order items must belong to the same vendor.';
    end if;

    if v_item.channel <> v_channel then
      raise exception 'Order item channel does not match the checkout channel.';
    end if;

    v_subtotal := v_subtotal + (coalesce(v_item.price_mwk, 0) * v_quantity);
  end loop;

  v_delivery_fee := coalesce((p_order ->> 'delivery_fee_mwk')::numeric, 0);
  v_service_fee := coalesce((p_order ->> 'service_fee_mwk')::numeric, round(v_subtotal * 0.03));
  v_total := v_subtotal + v_delivery_fee + v_service_fee;
  v_total_int := round(v_total)::integer;

  if v_total_int <= 0 then
    raise exception 'Wallet checkout total must be greater than zero.';
  end if;

  insert into public.wallet_accounts (user_id, balance_mwk, points)
  values (p_user_id, 0, 0)
  on conflict (user_id) do nothing;

  select *
  into v_wallet
  from public.wallet_accounts
  where user_id = p_user_id
  for update;

  if coalesce(v_wallet.balance_mwk, 0) < v_total_int then
    raise exception 'Insufficient wallet balance.';
  end if;

  update public.wallet_accounts
  set
    balance_mwk = balance_mwk - v_total_int,
    updated_at = now()
  where user_id = p_user_id;

  insert into public.wallet_activities (
    user_id,
    label,
    amount_mwk,
    type,
    meta
  )
  values (
    p_user_id,
    format('Wallet purchase - %s', coalesce(nullif(trim(p_title), ''), initcap(v_channel::text) || ' order')),
    -v_total_int,
    'payment',
    jsonb_build_object(
      'kind', 'wallet_checkout',
      'channel', v_channel,
      'vendor_id', v_vendor.id,
      'delivery_mode', v_delivery_mode,
      'payment_source', 'wallet',
      'payment_method', 'wallet',
      'payment_method_label', 'Wallet'
    )
  )
  returning id into v_wallet_activity_id;

  insert into public.orders (
    customer_id,
    vendor_id,
    channel,
    status,
    delivery_mode,
    pickup_notes,
    dropoff_notes,
    pickup_latitude,
    pickup_longitude,
    dropoff_latitude,
    dropoff_longitude,
    subtotal_mwk,
    delivery_fee_mwk,
    service_fee_mwk,
    total_mwk,
    payment_status
  )
  values (
    p_user_id,
    v_vendor.id,
    v_channel,
    'pending',
    v_delivery_mode,
    nullif(p_order ->> 'pickup_notes', ''),
    nullif(p_order ->> 'dropoff_notes', ''),
    nullif(p_order ->> 'pickup_latitude', '')::double precision,
    nullif(p_order ->> 'pickup_longitude', '')::double precision,
    nullif(p_order ->> 'dropoff_latitude', '')::double precision,
    nullif(p_order ->> 'dropoff_longitude', '')::double precision,
    v_subtotal,
    v_delivery_fee,
    v_service_fee,
    v_total,
    'paid'
  )
  returning id into v_order_id;

  for v_line in
    select value
    from jsonb_array_elements(v_lines)
  loop
    v_item_id := (v_line ->> 'item_id')::uuid;
    v_quantity := (v_line ->> 'quantity')::integer;

    select *
    into v_item
    from public.catalog_items
    where id = v_item_id;

    insert into public.order_items (
      order_id,
      item_id,
      item_name_snapshot,
      quantity,
      unit_price_mwk,
      line_total_mwk
    )
    values (
      v_order_id,
      v_item.id,
      v_item.name,
      v_quantity,
      v_item.price_mwk,
      v_item.price_mwk * v_quantity
    );
  end loop;

  if v_delivery_mode = 'doorstep' then
    insert into public.deliveries (
      order_id,
      status
    )
    values (
      v_order_id,
      'searching'
    );
  end if;

  v_order_reference := 'PMK-' || upper(substr(replace(v_order_id::text, '-', ''), 1, 8));
  v_delivery_pin := lpad((floor(random() * 1000000))::int::text, 6, '0');
  v_qr_token := v_order_id::text || ':' || extract(epoch from clock_timestamp())::bigint::text || ':' || lpad((floor(random() * 100000000))::int::text, 8, '0');
  v_payment_reference := 'wallet_' || v_order_id::text;
  v_customer_email := nullif(trim(coalesce(p_customer_email, '')), '');

  insert into public.payments (
    user_id,
    purpose,
    related_order_id,
    project,
    provider,
    method,
    reference,
    tx_ref,
    currency,
    amount_mwk,
    title,
    description,
    customer_email,
    status,
    metadata,
    provider_payload,
    verified_at,
    paid_at
  )
  values (
    p_user_id,
    'wallet_order_payment',
    v_order_id,
    'pa-level',
    'wallet',
    null,
    v_payment_reference,
    v_payment_reference,
    'MWK',
    v_total_int,
    coalesce(nullif(trim(p_title), ''), 'Wallet order payment'),
    coalesce(nullif(trim(p_description), ''), 'Wallet payment'),
    v_customer_email,
    'paid',
    jsonb_build_object(
      'purpose', 'campus_market_order',
      'payment_source', 'wallet',
      'wallet_activity_id', v_wallet_activity_id,
      'order', p_order,
      'handoff', jsonb_build_object(
        'order_reference', v_order_reference,
        'delivery_pin', v_delivery_pin,
        'qr_token', v_qr_token,
        'issued_at', now(),
        'verified_at', null,
        'verified_by', null
      )
    ),
    jsonb_build_object(
      'source', 'wallet',
      'wallet_activity_id', v_wallet_activity_id
    ),
    now(),
    now()
  )
  returning id into v_payment_id;

  insert into public.payment_events (
    payment_id,
    event_type,
    status,
    payload
  )
  values (
    v_payment_id,
    'wallet_checkout',
    'paid',
    jsonb_build_object(
      'order_id', v_order_id,
      'wallet_activity_id', v_wallet_activity_id
    )
  );

  insert into public.order_handoffs (
    order_id,
    payment_id,
    order_reference,
    delivery_pin,
    qr_token
  )
  values (
    v_order_id,
    v_payment_id,
    v_order_reference,
    v_delivery_pin,
    v_qr_token
  );

  return jsonb_build_object(
    'order_id', v_order_id,
    'payment_id', v_payment_id,
    'wallet_balance_mwk', v_wallet.balance_mwk - v_total_int,
    'wallet_activity_id', v_wallet_activity_id,
    'order_reference', v_order_reference,
    'delivery_pin', v_delivery_pin,
    'qr_token', v_qr_token
  );
end;
$$;

grant execute on function public.wallet_checkout_campus_market(uuid, text, text, text, jsonb) to service_role;
