-- Food providers control preparation, not payment truth. Preserve the legacy RPC
-- name for clients while removing its ability to manufacture a paid order.

create or replace function public.approve_food_order_payment(
  p_order_id uuid,
  p_room_number text default null
)
returns public.orders
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_order public.orders;
  v_vendor_owner uuid;
  v_first_approval boolean := false;
  v_room text;
  v_payment_eligible boolean := false;
begin
  if auth.uid() is null then
    raise exception 'Authentication required.';
  end if;

  select v.owner_id,
         (
           lower(coalesce(o.payment_status::text, '')) in ('paid', 'completed', 'successful', 'approved')
           or exists (
             select 1
             from public.payments p
             where p.related_order_id = o.id
               and p.provider = 'cash'
               and p.status = 'pending'
           )
         )
    into v_vendor_owner, v_payment_eligible
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
  if not v_payment_eligible then
    raise exception 'Payment is not confirmed and this is not an authorized cash-on-delivery order.';
  end if;

  select o.restaurant_approved_at is null
    into v_first_approval
  from public.orders o
  where o.id = p_order_id;

  v_room := nullif(trim(coalesce(p_room_number, '')), '');

  update public.orders
  set room_number = coalesce(v_room, room_number),
      dropoff_notes = case
        when coalesce(delivery_mode::text, '') = 'doorstep' and v_room is not null then 'Room ' || v_room
        else dropoff_notes
      end,
      status = case when status::text = 'pending' then 'preparing'::public.order_status else status end,
      restaurant_approved_at = coalesce(restaurant_approved_at, now()),
      restaurant_approved_by = coalesce(restaurant_approved_by, auth.uid()),
      updated_at = now()
  where id = p_order_id
  returning * into v_order;

  if v_first_approval then
    insert into public.notifications (user_id, title, message, type, priority, data, is_read)
    values (
      v_order.customer_id,
      'Order accepted by restaurant',
      'Your food provider accepted the order and started preparing it for ' || public.food_order_room_label(v_order) || '.',
      'order_status_changed',
      'important',
      jsonb_build_object('orderId', v_order.id::text, 'relatedOrderId', v_order.id::text, 'status', 'preparing', 'roomNumber', v_order.room_number, 'event', 'restaurant_order_accepted'),
      false
    );

    insert into public.notifications (user_id, title, message, type, priority, data, is_read)
    select distinct ra.user_id,
      'Upcoming food delivery',
      'A restaurant accepted a food order for ' || public.food_order_room_label(v_order) || '. Stay online for the pickup release.',
      'delivery_status_changed',
      'normal',
      jsonb_build_object('orderId', v_order.id::text, 'relatedOrderId', v_order.id::text, 'status', 'preparing', 'roomNumber', v_order.room_number, 'event', 'food_order_accepted'),
      false
    from public.role_applications ra
    where ra.target_role::text = 'agent' and ra.status::text = 'approved';
  end if;

  return v_order;
end;
$$;

revoke all on function public.approve_food_order_payment(uuid, text) from public, anon;
grant execute on function public.approve_food_order_payment(uuid, text) to authenticated;

