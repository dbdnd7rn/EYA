-- Secure food-order lifecycle
-- Student order -> restaurant payment approval -> kitchen preparation -> rider release -> QR/PIN handoff.

begin;

alter table public.orders
  add column if not exists room_number text,
  add column if not exists restaurant_approved_at timestamptz,
  add column if not exists restaurant_approved_by uuid,
  add column if not exists rider_released_at timestamptz;

create index if not exists orders_food_security_queue_idx
  on public.orders (channel, status, restaurant_approved_at, rider_released_at, created_at desc);

create or replace function public.food_order_room_label(p_order public.orders)
returns text
language sql
stable
as $$
  select coalesce(
    nullif(trim(p_order.room_number), ''),
    nullif(trim(p_order.dropoff_notes), ''),
    'Campus residence'
  );
$$;

create or replace function public.approve_food_order_payment(
  p_order_id uuid,
  p_room_number text default null
)
returns public.orders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders;
  v_vendor_owner uuid;
  v_first_approval boolean := false;
  v_room text;
begin
  if auth.uid() is null then
    raise exception 'Authentication required.';
  end if;

  select v.owner_id
    into v_vendor_owner
  from public.orders o
  join public.vendors v on v.id = o.vendor_id
  where o.id = p_order_id
    and coalesce(o.channel::text, '') = 'food'
  limit 1;

  if v_vendor_owner is null then
    raise exception 'Food order not found.';
  end if;

  if v_vendor_owner <> auth.uid() then
    raise exception 'Only this food provider can approve the order.';
  end if;

  select o.restaurant_approved_at is null
    into v_first_approval
  from public.orders o
  where o.id = p_order_id;

  v_room := nullif(trim(coalesce(p_room_number, '')), '');

  update public.orders
  set
    room_number = coalesce(v_room, room_number),
    dropoff_notes = case
      when coalesce(delivery_mode::text, '') = 'doorstep' and v_room is not null
        then 'Room ' || v_room
      else dropoff_notes
    end,
    payment_status = case
      when lower(coalesce(payment_status::text, '')) in ('paid', 'completed', 'successful', 'approved') then payment_status
      else 'paid'
    end,
    status = case
      when status::text = 'pending' then 'preparing'::public.order_status
      else status
    end,
    restaurant_approved_at = coalesce(restaurant_approved_at, now()),
    restaurant_approved_by = coalesce(restaurant_approved_by, auth.uid()),
    updated_at = now()
  where id = p_order_id
  returning * into v_order;

  if v_first_approval then
    insert into public.notifications (user_id, title, message, type, priority, data, is_read)
    values (
      v_order.customer_id,
      'Payment approved by restaurant',
      'Your food provider confirmed the order and started preparing it for ' || public.food_order_room_label(v_order) || '.',
      'order_status_changed',
      'important',
      jsonb_build_object(
        'orderId', v_order.id::text,
        'relatedOrderId', v_order.id::text,
        'status', 'preparing',
        'roomNumber', v_order.room_number,
        'event', 'restaurant_payment_approved'
      ),
      false
    );

    insert into public.notifications (user_id, title, message, type, priority, data, is_read)
    select distinct
      ra.user_id,
      'Upcoming food delivery',
      'A restaurant approved a food order for ' || public.food_order_room_label(v_order) || '. Stay online for the pickup release.',
      'delivery_status_changed',
      'normal',
      jsonb_build_object(
        'orderId', v_order.id::text,
        'relatedOrderId', v_order.id::text,
        'status', 'preparing',
        'roomNumber', v_order.room_number,
        'event', 'food_order_approved'
      ),
      false
    from public.role_applications ra
    where ra.target_role::text = 'agent'
      and ra.status::text = 'approved';
  end if;

  return v_order;
end;
$$;

create or replace function public.release_food_order_to_riders(p_order_id uuid)
returns public.orders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders;
  v_vendor_owner uuid;
  v_first_release boolean := false;
begin
  if auth.uid() is null then
    raise exception 'Authentication required.';
  end if;

  select v.owner_id
    into v_vendor_owner
  from public.orders o
  join public.vendors v on v.id = o.vendor_id
  where o.id = p_order_id
    and coalesce(o.channel::text, '') = 'food'
  limit 1;

  if v_vendor_owner is null then
    raise exception 'Food order not found.';
  end if;

  if v_vendor_owner <> auth.uid() then
    raise exception 'Only this food provider can release the order.';
  end if;

  select o.rider_released_at is null
    into v_first_release
  from public.orders o
  where o.id = p_order_id;

  update public.orders
  set
    status = 'accepted'::public.order_status,
    rider_released_at = coalesce(rider_released_at, now()),
    updated_at = now()
  where id = p_order_id
    and restaurant_approved_at is not null
  returning * into v_order;

  if v_order.id is null then
    raise exception 'Approve the payment before releasing this order to riders.';
  end if;

  update public.deliveries
  set status = 'searching', updated_at = now()
  where order_id = p_order_id
    and driver_id is null
    and status::text <> 'delivered';

  if v_first_release then
    insert into public.notifications (user_id, title, message, type, priority, data, is_read)
    select distinct
      ra.user_id,
      'Food order ready for pickup',
      'A prepared order is ready for delivery to ' || public.food_order_room_label(v_order) || '. Open Deliveries to accept it.',
      'delivery_assigned',
      'important',
      jsonb_build_object(
        'orderId', v_order.id::text,
        'relatedOrderId', v_order.id::text,
        'status', 'searching',
        'roomNumber', v_order.room_number,
        'event', 'food_order_ready_for_rider'
      ),
      false
    from public.role_applications ra
    where ra.target_role::text = 'agent'
      and ra.status::text = 'approved';

    insert into public.notifications (user_id, title, message, type, priority, data, is_read)
    values (
      v_order.customer_id,
      'Meal ready for delivery',
      'Your meal is packed. A rider can now accept the trip to ' || public.food_order_room_label(v_order) || '.',
      'delivery_status_changed',
      'important',
      jsonb_build_object(
        'orderId', v_order.id::text,
        'relatedOrderId', v_order.id::text,
        'status', 'searching',
        'roomNumber', v_order.room_number,
        'event', 'food_order_ready_for_rider'
      ),
      false
    );
  end if;

  return v_order;
end;
$$;

grant execute on function public.approve_food_order_payment(uuid, text) to authenticated;
grant execute on function public.release_food_order_to_riders(uuid) to authenticated;

commit;
