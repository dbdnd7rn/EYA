-- Restore the RLS boundary that was authored in the public market unification
-- script but is missing from the live schema. Legacy tables remain deny-all.

revoke all on table public.listing_versions, public.reports from anon, authenticated;

revoke all on table
  public.orders,
  public.order_items,
  public.deliveries,
  public.order_handoffs,
  public.driver_locations,
  public.trust_scores
from anon;

revoke all on table
  public.orders,
  public.order_items,
  public.deliveries,
  public.order_handoffs,
  public.driver_locations,
  public.trust_scores
from authenticated;

grant select, insert, update on table public.orders to authenticated;
grant select, insert on table public.order_items to authenticated;
grant select, insert, update on table public.deliveries to authenticated;
grant select, insert, update on table public.order_handoffs to authenticated;
grant select, insert on table public.driver_locations to authenticated;
grant select on table public.trust_scores to authenticated;

alter table public.listing_versions enable row level security;
alter table public.reports enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.deliveries enable row level security;
alter table public.order_handoffs enable row level security;
alter table public.driver_locations enable row level security;
alter table public.trust_scores enable row level security;

-- These helpers execute as the migration owner so policy checks do not recurse
-- between orders and deliveries. Each helper is identity-bound to auth.uid().
create or replace function public.is_market_order_customer(p_order_id uuid)
returns boolean language sql stable security definer
set search_path = public, auth, pg_temp
as $$ select exists (select 1 from public.orders o where o.id = p_order_id and o.customer_id = auth.uid()) $$;

create or replace function public.is_market_order_vendor_owner(p_order_id uuid)
returns boolean language sql stable security definer
set search_path = public, auth, pg_temp
as $$
  select exists (
    select 1 from public.orders o join public.vendors v on v.id = o.vendor_id
    where o.id = p_order_id and v.owner_id = auth.uid()
  )
$$;

create or replace function public.is_market_order_driver(p_order_id uuid)
returns boolean language sql stable security definer
set search_path = public, auth, pg_temp
as $$
  select exists (
    select 1 from public.deliveries d where d.order_id = p_order_id and d.driver_id = auth.uid()
  )
$$;

revoke all on function public.is_market_order_customer(uuid) from public, anon;
revoke all on function public.is_market_order_vendor_owner(uuid) from public, anon;
revoke all on function public.is_market_order_driver(uuid) from public, anon;
grant execute on function public.is_market_order_customer(uuid) to authenticated, service_role;
grant execute on function public.is_market_order_vendor_owner(uuid) to authenticated, service_role;
grant execute on function public.is_market_order_driver(uuid) to authenticated, service_role;

create policy "orders_select_participants" on public.orders
for select to authenticated
using (
  public.is_market_order_customer(id)
  or public.is_market_order_vendor_owner(id)
  or public.is_market_order_driver(id)
);

create policy "orders_insert_customer" on public.orders
for insert to authenticated with check (customer_id = auth.uid());

create policy "orders_update_customer_vendor_or_driver" on public.orders
for update to authenticated
using (
  public.is_market_order_customer(id)
  or public.is_market_order_vendor_owner(id)
  or public.is_market_order_driver(id)
);

create policy "order_items_select_participants" on public.order_items
for select to authenticated
using (
  public.is_market_order_customer(order_id)
  or public.is_market_order_vendor_owner(order_id)
  or public.is_market_order_driver(order_id)
);

create policy "order_items_insert_customer" on public.order_items
for insert to authenticated
with check (public.is_market_order_customer(order_id));

create policy "deliveries_select_participants" on public.deliveries
for select to authenticated
using (
  driver_id = auth.uid()
  or public.is_market_order_customer(order_id)
  or public.is_market_order_vendor_owner(order_id)
);

create policy "deliveries_insert_vendor" on public.deliveries
for insert to authenticated
with check (public.is_market_order_vendor_owner(order_id));

create policy "deliveries_update_driver_or_vendor" on public.deliveries
for update to authenticated
using (
  driver_id = auth.uid()
  or public.is_market_order_vendor_owner(order_id)
);

create policy "order_handoffs_select_participants" on public.order_handoffs
for select to authenticated
using (
  public.is_market_order_customer(order_id)
  or public.is_market_order_vendor_owner(order_id)
  or public.is_market_order_driver(order_id)
);

create policy "order_handoffs_update_driver_or_vendor" on public.order_handoffs
for update to authenticated
using (
  public.is_market_order_vendor_owner(order_id)
  or public.is_market_order_driver(order_id)
);

create policy "driver_locations_insert_self" on public.driver_locations
for insert to authenticated with check (driver_id = auth.uid());

create policy "driver_locations_select_participants" on public.driver_locations
for select to authenticated
using (
  driver_id = auth.uid()
  or exists (
    select 1 from public.deliveries d
    where d.driver_id = driver_locations.driver_id
      and (public.is_market_order_customer(d.order_id) or public.is_market_order_vendor_owner(d.order_id))
  )
);

create policy "trust_scores_read_all" on public.trust_scores
for select to authenticated using (true);
