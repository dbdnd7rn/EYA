-- Financial and fulfilment records are server-authoritative. Browser clients may
-- read participant-scoped rows, but may not write arbitrary columns directly.

revoke insert, update, delete, truncate on table public.orders from authenticated;
revoke insert, update, delete, truncate on table public.order_items from authenticated;
revoke insert, update, delete, truncate on table public.deliveries from authenticated;
revoke insert, update, delete, truncate on table public.order_handoffs from authenticated;
revoke insert, update, delete, truncate on table public.driver_locations from authenticated;
revoke insert, update, delete, truncate on table public.trust_scores from authenticated;

create or replace function public.vendor_transition_order_status(
  p_order_id uuid,
  p_status text
)
returns public.orders
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_order public.orders%rowtype;
  v_is_cash_on_delivery boolean := false;
begin
  if v_user is null then
    raise exception 'Authentication required.';
  end if;

  if p_status not in ('accepted', 'preparing', 'picked_up', 'delivered', 'cancelled') then
    raise exception 'Unsupported vendor order status.';
  end if;

  select o.* into v_order
  from public.orders o
  join public.vendors v on v.id = o.vendor_id
  where o.id = p_order_id and v.owner_id = v_user
  for update of o;

  if not found then
    raise exception 'Vendor order not found.';
  end if;

  if v_order.status in ('delivered', 'cancelled') then
    raise exception 'Completed or cancelled orders cannot be changed.';
  end if;

  select exists (
    select 1 from public.payments p
    where p.related_order_id = v_order.id
      and p.provider = 'cash'
      and p.status = 'pending'
  ) into v_is_cash_on_delivery;

  if p_status <> 'cancelled'
     and v_order.payment_status <> 'paid'
     and not v_is_cash_on_delivery then
    raise exception 'Payment must be verified before fulfilment starts.';
  end if;

  if not (
    (v_order.status = 'pending' and p_status in ('accepted', 'preparing', 'cancelled'))
    or (v_order.status = 'preparing' and p_status in ('accepted', 'cancelled'))
    or (v_order.status = 'accepted' and p_status in ('preparing', 'picked_up', 'cancelled'))
    or (v_order.status = 'picked_up' and p_status = 'delivered' and v_order.delivery_mode = 'pickup')
  ) then
    raise exception 'Invalid vendor order transition: % -> %.', v_order.status, p_status;
  end if;

  update public.orders
  set status = p_status, updated_at = now()
  where id = v_order.id
  returning * into v_order;

  return v_order;
end;
$$;

revoke all on function public.vendor_transition_order_status(uuid, text)
from public, anon;
grant execute on function public.vendor_transition_order_status(uuid, text)
to authenticated, service_role;
