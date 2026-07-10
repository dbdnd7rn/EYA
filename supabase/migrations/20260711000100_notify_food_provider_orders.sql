begin;

create or replace function public.notify_food_provider_on_new_order()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  provider_user_id uuid;
  order_total_text text;
begin
  if coalesce(new.channel::text, '') <> 'food' then
    return new;
  end if;

  select vendor.owner_id
    into provider_user_id
  from public.vendors as vendor
  where vendor.id = new.vendor_id
  limit 1;

  if provider_user_id is null then
    return new;
  end if;

  order_total_text := trim(to_char(coalesce(new.total_mwk, 0), 'FM999,999,999,990'));

  insert into public.notifications (
    user_id,
    title,
    message,
    type,
    priority,
    data,
    is_read
  )
  values (
    provider_user_id,
    'New food order',
    'A student placed a new meal order worth MWK ' || order_total_text || '. Open the order to view the meal and start preparing it.',
    'vendor_order_created',
    'important',
    jsonb_build_object(
      'orderId', new.id::text,
      'relatedOrderId', new.id::text,
      'vendorId', new.vendor_id::text,
      'channel', 'food',
      'status', new.status::text,
      'totalMwk', new.total_mwk
    ),
    false
  );

  return new;
end;
$$;

drop trigger if exists notify_food_provider_on_new_order_trigger on public.orders;

create trigger notify_food_provider_on_new_order_trigger
after insert on public.orders
for each row
execute function public.notify_food_provider_on_new_order();

commit;
