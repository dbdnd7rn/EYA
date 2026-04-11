create or replace function public.set_updated_at_column()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.vendors (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  description text,
  supports_market boolean not null default true,
  supports_food boolean not null default false,
  campus text,
  area text,
  city text,
  latitude double precision,
  longitude double precision,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.catalog_items (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references public.vendors(id) on delete cascade,
  channel text not null check (channel in ('market', 'food')),
  name text not null,
  description text,
  price_mwk numeric not null check (price_mwk >= 0),
  stock_qty integer,
  image_url text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references auth.users(id) on delete cascade,
  vendor_id uuid not null references public.vendors(id) on delete restrict,
  channel text not null check (channel in ('market', 'food')),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'preparing', 'picked_up', 'on_the_way', 'delivered', 'cancelled')),
  delivery_mode text not null default 'pickup' check (delivery_mode in ('pickup', 'doorstep')),
  pickup_notes text,
  dropoff_notes text,
  pickup_latitude double precision,
  pickup_longitude double precision,
  dropoff_latitude double precision,
  dropoff_longitude double precision,
  subtotal_mwk numeric not null default 0,
  delivery_fee_mwk numeric not null default 0,
  service_fee_mwk numeric not null default 0,
  total_mwk numeric not null default 0,
  payment_status text not null default 'unpaid',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  item_id uuid not null references public.catalog_items(id) on delete restrict,
  item_name_snapshot text not null,
  quantity integer not null check (quantity > 0),
  unit_price_mwk numeric not null check (unit_price_mwk >= 0),
  line_total_mwk numeric not null check (line_total_mwk >= 0),
  created_at timestamptz not null default now()
);

create table if not exists public.deliveries (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references public.orders(id) on delete cascade,
  driver_id uuid references auth.users(id) on delete set null,
  status text not null default 'searching' check (status in ('searching', 'assigned', 'picked_up', 'arriving', 'delivered', 'failed', 'cancelled')),
  eta_minutes integer,
  current_latitude double precision,
  current_longitude double precision,
  proof_photo_url text,
  delivered_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.order_handoffs (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references public.orders(id) on delete cascade,
  payment_id uuid references public.payments(id) on delete set null,
  order_reference text not null unique,
  delivery_pin text not null,
  qr_token text not null unique,
  verification_method text check (verification_method in ('pin', 'qr')),
  verified_at timestamptz,
  verified_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.driver_locations (
  id uuid primary key default gen_random_uuid(),
  driver_id uuid not null references auth.users(id) on delete cascade,
  latitude double precision not null,
  longitude double precision not null,
  heading double precision,
  speed_kph double precision,
  recorded_at timestamptz not null default now()
);

create table if not exists public.trust_scores (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null check (entity_type in ('vendor', 'driver', 'customer')),
  entity_id uuid not null,
  score numeric not null check (score >= 0 and score <= 100),
  order_success_rate numeric,
  dispute_rate numeric,
  avg_rating numeric,
  updated_at timestamptz not null default now()
);

create table if not exists public.vendor_conversations (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references public.vendors(id) on delete cascade,
  customer_id uuid not null references auth.users(id) on delete cascade,
  channel text not null check (channel in ('market', 'food')),
  catalog_item_id uuid references public.catalog_items(id) on delete set null,
  subject text,
  last_message_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.vendor_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.vendor_conversations(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete cascade,
  receiver_id uuid not null references auth.users(id) on delete cascade,
  sender_role text not null check (sender_role in ('customer', 'vendor', 'admin')),
  receiver_role text not null check (receiver_role in ('customer', 'vendor', 'admin')),
  content text,
  message_type text not null default 'text' check (message_type in ('text', 'image')),
  image_url text,
  created_at timestamptz not null default now()
);

create index if not exists idx_public_vendors_owner_id on public.vendors(owner_id);
create index if not exists idx_public_catalog_items_vendor_id on public.catalog_items(vendor_id);
create index if not exists idx_public_catalog_items_channel on public.catalog_items(channel);
create index if not exists idx_public_orders_customer_id on public.orders(customer_id);
create index if not exists idx_public_orders_vendor_id on public.orders(vendor_id);
create index if not exists idx_public_orders_status on public.orders(status);
create index if not exists idx_public_order_items_order_id on public.order_items(order_id);
create index if not exists idx_public_deliveries_driver_id on public.deliveries(driver_id);
create index if not exists idx_public_deliveries_status on public.deliveries(status);
create index if not exists idx_public_order_handoffs_order_id on public.order_handoffs(order_id);
create index if not exists idx_public_driver_locations_driver_time on public.driver_locations(driver_id, recorded_at desc);
create index if not exists idx_public_vendor_conversations_vendor_id on public.vendor_conversations(vendor_id, last_message_at desc);
create index if not exists idx_public_vendor_conversations_customer_id on public.vendor_conversations(customer_id, last_message_at desc);
create index if not exists idx_public_vendor_messages_conversation_id on public.vendor_messages(conversation_id, created_at asc);

drop trigger if exists trg_public_vendors_updated_at on public.vendors;
create trigger trg_public_vendors_updated_at before update on public.vendors for each row execute function public.set_updated_at_column();
drop trigger if exists trg_public_catalog_items_updated_at on public.catalog_items;
create trigger trg_public_catalog_items_updated_at before update on public.catalog_items for each row execute function public.set_updated_at_column();
drop trigger if exists trg_public_orders_updated_at on public.orders;
create trigger trg_public_orders_updated_at before update on public.orders for each row execute function public.set_updated_at_column();
drop trigger if exists trg_public_deliveries_updated_at on public.deliveries;
create trigger trg_public_deliveries_updated_at before update on public.deliveries for each row execute function public.set_updated_at_column();
drop trigger if exists trg_public_order_handoffs_updated_at on public.order_handoffs;
create trigger trg_public_order_handoffs_updated_at before update on public.order_handoffs for each row execute function public.set_updated_at_column();
drop trigger if exists trg_public_vendor_conversations_updated_at on public.vendor_conversations;
create trigger trg_public_vendor_conversations_updated_at before update on public.vendor_conversations for each row execute function public.set_updated_at_column();

create or replace function public.touch_vendor_conversation()
returns trigger
language plpgsql
as $$
begin
  update public.vendor_conversations
  set last_message_at = new.created_at,
      updated_at = now()
  where id = new.conversation_id;
  return new;
end;
$$;

drop trigger if exists trg_public_vendor_messages_touch_conversation on public.vendor_messages;
create trigger trg_public_vendor_messages_touch_conversation
after insert on public.vendor_messages
for each row execute function public.touch_vendor_conversation();

insert into public.vendors (
  id, owner_id, name, description, supports_market, supports_food, campus, area, city, latitude, longitude, is_active, created_at, updated_at
)
select
  id, owner_id, name, description, supports_market, supports_food, campus, area, city, latitude, longitude, is_active, created_at, updated_at
from campus_market.vendors
on conflict (id) do update
set
  owner_id = excluded.owner_id,
  name = excluded.name,
  description = excluded.description,
  supports_market = excluded.supports_market,
  supports_food = excluded.supports_food,
  campus = excluded.campus,
  area = excluded.area,
  city = excluded.city,
  latitude = excluded.latitude,
  longitude = excluded.longitude,
  is_active = excluded.is_active,
  updated_at = excluded.updated_at;

insert into public.catalog_items (
  id, vendor_id, channel, name, description, price_mwk, stock_qty, image_url, is_active, created_at, updated_at
)
select
  id, vendor_id, channel::text, name, description, price_mwk, stock_qty, image_url, is_active, created_at, updated_at
from campus_market.catalog_items
on conflict (id) do update
set
  vendor_id = excluded.vendor_id,
  channel = excluded.channel,
  name = excluded.name,
  description = excluded.description,
  price_mwk = excluded.price_mwk,
  stock_qty = excluded.stock_qty,
  image_url = excluded.image_url,
  is_active = excluded.is_active,
  updated_at = excluded.updated_at;

insert into public.orders (
  id, customer_id, vendor_id, channel, status, delivery_mode, pickup_notes, dropoff_notes,
  pickup_latitude, pickup_longitude, dropoff_latitude, dropoff_longitude, subtotal_mwk,
  delivery_fee_mwk, service_fee_mwk, total_mwk, payment_status, created_at, updated_at
)
select
  id, customer_id, vendor_id, channel::text, status::text, delivery_mode::text, pickup_notes, dropoff_notes,
  pickup_latitude, pickup_longitude, dropoff_latitude, dropoff_longitude, subtotal_mwk,
  delivery_fee_mwk, service_fee_mwk, total_mwk, payment_status, created_at, updated_at
from campus_market.orders
on conflict (id) do update
set
  customer_id = excluded.customer_id,
  vendor_id = excluded.vendor_id,
  channel = excluded.channel,
  status = excluded.status,
  delivery_mode = excluded.delivery_mode,
  pickup_notes = excluded.pickup_notes,
  dropoff_notes = excluded.dropoff_notes,
  pickup_latitude = excluded.pickup_latitude,
  pickup_longitude = excluded.pickup_longitude,
  dropoff_latitude = excluded.dropoff_latitude,
  dropoff_longitude = excluded.dropoff_longitude,
  subtotal_mwk = excluded.subtotal_mwk,
  delivery_fee_mwk = excluded.delivery_fee_mwk,
  service_fee_mwk = excluded.service_fee_mwk,
  total_mwk = excluded.total_mwk,
  payment_status = excluded.payment_status,
  updated_at = excluded.updated_at;

insert into public.order_items (
  id, order_id, item_id, item_name_snapshot, quantity, unit_price_mwk, line_total_mwk, created_at
)
select
  id, order_id, item_id, item_name_snapshot, quantity, unit_price_mwk, line_total_mwk, created_at
from campus_market.order_items
on conflict (id) do nothing;

insert into public.deliveries (
  id, order_id, driver_id, status, eta_minutes, current_latitude, current_longitude, proof_photo_url, delivered_at, created_at, updated_at
)
select
  id, order_id, driver_id, status::text, eta_minutes, current_latitude, current_longitude, proof_photo_url, delivered_at, created_at, updated_at
from campus_market.deliveries
on conflict (id) do update
set
  order_id = excluded.order_id,
  driver_id = excluded.driver_id,
  status = excluded.status,
  eta_minutes = excluded.eta_minutes,
  current_latitude = excluded.current_latitude,
  current_longitude = excluded.current_longitude,
  proof_photo_url = excluded.proof_photo_url,
  delivered_at = excluded.delivered_at,
  updated_at = excluded.updated_at;

insert into public.order_handoffs (
  id, order_id, payment_id, order_reference, delivery_pin, qr_token, verification_method, verified_at, verified_by, created_at, updated_at
)
select
  id, order_id, payment_id, order_reference, delivery_pin, qr_token, verification_method, verified_at, verified_by, created_at, updated_at
from campus_market.order_handoffs
on conflict (id) do update
set
  order_id = excluded.order_id,
  payment_id = excluded.payment_id,
  order_reference = excluded.order_reference,
  delivery_pin = excluded.delivery_pin,
  qr_token = excluded.qr_token,
  verification_method = excluded.verification_method,
  verified_at = excluded.verified_at,
  verified_by = excluded.verified_by,
  updated_at = excluded.updated_at;

insert into public.driver_locations (
  id, driver_id, latitude, longitude, heading, speed_kph, recorded_at
)
select
  id, driver_id, latitude, longitude, heading, speed_kph, recorded_at
from campus_market.driver_locations
on conflict (id) do nothing;

insert into public.trust_scores (
  id, entity_type, entity_id, score, order_success_rate, dispute_rate, avg_rating, updated_at
)
select
  id, entity_type, entity_id, score, order_success_rate, dispute_rate, avg_rating, updated_at
from campus_market.trust_scores
on conflict (id) do update
set
  entity_type = excluded.entity_type,
  entity_id = excluded.entity_id,
  score = excluded.score,
  order_success_rate = excluded.order_success_rate,
  dispute_rate = excluded.dispute_rate,
  avg_rating = excluded.avg_rating,
  updated_at = excluded.updated_at;

do $$
begin
  if to_regclass('campus_market.vendor_conversations') is not null then
    insert into public.vendor_conversations (
      id, vendor_id, customer_id, channel, catalog_item_id, subject, last_message_at, created_at, updated_at
    )
    select
      id, vendor_id, customer_id, channel::text, catalog_item_id, subject, last_message_at, created_at, updated_at
    from campus_market.vendor_conversations
    on conflict (id) do update
    set
      vendor_id = excluded.vendor_id,
      customer_id = excluded.customer_id,
      channel = excluded.channel,
      catalog_item_id = excluded.catalog_item_id,
      subject = excluded.subject,
      last_message_at = excluded.last_message_at,
      updated_at = excluded.updated_at;
  end if;
end $$;

do $$
begin
  if to_regclass('campus_market.vendor_messages') is not null then
    insert into public.vendor_messages (
      id, conversation_id, sender_id, receiver_id, sender_role, receiver_role, content, message_type, image_url, created_at
    )
    select
      id, conversation_id, sender_id, receiver_id, sender_role, receiver_role, content, message_type, image_url, created_at
    from campus_market.vendor_messages
    on conflict (id) do nothing;
  end if;
end $$;

grant select, insert, update on public.vendors to authenticated;
grant select, insert, update, delete on public.catalog_items to authenticated;
grant select, insert, update on public.orders to authenticated;
grant select, insert on public.order_items to authenticated;
grant select, insert, update on public.deliveries to authenticated;
grant select, insert, update on public.order_handoffs to authenticated;
grant select, insert on public.driver_locations to authenticated;
grant select on public.trust_scores to authenticated;
grant select, insert on public.vendor_conversations to authenticated;
grant select, insert on public.vendor_messages to authenticated;

grant all on public.vendors, public.catalog_items, public.orders, public.order_items, public.deliveries, public.order_handoffs, public.driver_locations, public.trust_scores, public.vendor_conversations, public.vendor_messages to service_role;

alter table public.vendors enable row level security;
alter table public.catalog_items enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.deliveries enable row level security;
alter table public.order_handoffs enable row level security;
alter table public.driver_locations enable row level security;
alter table public.trust_scores enable row level security;
alter table public.vendor_conversations enable row level security;
alter table public.vendor_messages enable row level security;

drop policy if exists "vendors_select_all_active" on public.vendors;
create policy "vendors_select_all_active" on public.vendors
for select to authenticated
using (is_active = true or owner_id = auth.uid());

drop policy if exists "vendors_insert_owner" on public.vendors;
create policy "vendors_insert_owner" on public.vendors
for insert to authenticated
with check (owner_id = auth.uid());

drop policy if exists "vendors_update_owner" on public.vendors;
create policy "vendors_update_owner" on public.vendors
for update to authenticated
using (owner_id = auth.uid())
with check (owner_id = auth.uid());

drop policy if exists "catalog_items_select_active_or_owner" on public.catalog_items;
create policy "catalog_items_select_active_or_owner" on public.catalog_items
for select to authenticated
using (
  is_active = true
  or exists (
    select 1 from public.vendors v
    where v.id = catalog_items.vendor_id and v.owner_id = auth.uid()
  )
);

drop policy if exists "catalog_items_insert_owner" on public.catalog_items;
create policy "catalog_items_insert_owner" on public.catalog_items
for insert to authenticated
with check (
  exists (
    select 1 from public.vendors v
    where v.id = catalog_items.vendor_id and v.owner_id = auth.uid()
  )
);

drop policy if exists "catalog_items_update_owner" on public.catalog_items;
create policy "catalog_items_update_owner" on public.catalog_items
for update to authenticated
using (
  exists (
    select 1 from public.vendors v
    where v.id = catalog_items.vendor_id and v.owner_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from public.vendors v
    where v.id = catalog_items.vendor_id and v.owner_id = auth.uid()
  )
);

drop policy if exists "catalog_items_delete_owner" on public.catalog_items;
create policy "catalog_items_delete_owner" on public.catalog_items
for delete to authenticated
using (
  exists (
    select 1 from public.vendors v
    where v.id = catalog_items.vendor_id and v.owner_id = auth.uid()
  )
);

drop policy if exists "orders_select_participants" on public.orders;
create policy "orders_select_participants" on public.orders
for select to authenticated
using (
  customer_id = auth.uid()
  or exists (
    select 1 from public.vendors v
    where v.id = orders.vendor_id and v.owner_id = auth.uid()
  )
  or exists (
    select 1 from public.deliveries d
    where d.order_id = orders.id and d.driver_id = auth.uid()
  )
);

drop policy if exists "orders_insert_customer" on public.orders;
create policy "orders_insert_customer" on public.orders
for insert to authenticated
with check (customer_id = auth.uid());

drop policy if exists "orders_update_customer_vendor_or_driver" on public.orders;
create policy "orders_update_customer_vendor_or_driver" on public.orders
for update to authenticated
using (
  customer_id = auth.uid()
  or exists (
    select 1 from public.vendors v
    where v.id = orders.vendor_id and v.owner_id = auth.uid()
  )
  or exists (
    select 1 from public.deliveries d
    where d.order_id = orders.id and d.driver_id = auth.uid()
  )
);

drop policy if exists "order_items_select_participants" on public.order_items;
create policy "order_items_select_participants" on public.order_items
for select to authenticated
using (
  exists (
    select 1
    from public.orders o
    left join public.vendors v on v.id = o.vendor_id
    left join public.deliveries d on d.order_id = o.id
    where o.id = order_items.order_id
      and (o.customer_id = auth.uid() or v.owner_id = auth.uid() or d.driver_id = auth.uid())
  )
);

drop policy if exists "order_items_insert_customer" on public.order_items;
create policy "order_items_insert_customer" on public.order_items
for insert to authenticated
with check (
  exists (
    select 1 from public.orders o
    where o.id = order_items.order_id and o.customer_id = auth.uid()
  )
);

drop policy if exists "deliveries_select_participants" on public.deliveries;
create policy "deliveries_select_participants" on public.deliveries
for select to authenticated
using (
  driver_id = auth.uid()
  or exists (
    select 1
    from public.orders o
    left join public.vendors v on v.id = o.vendor_id
    where o.id = deliveries.order_id
      and (o.customer_id = auth.uid() or v.owner_id = auth.uid())
  )
);

drop policy if exists "deliveries_insert_vendor" on public.deliveries;
create policy "deliveries_insert_vendor" on public.deliveries
for insert to authenticated
with check (
  exists (
    select 1
    from public.orders o
    join public.vendors v on v.id = o.vendor_id
    where o.id = deliveries.order_id and v.owner_id = auth.uid()
  )
);

drop policy if exists "deliveries_update_driver_or_vendor" on public.deliveries;
create policy "deliveries_update_driver_or_vendor" on public.deliveries
for update to authenticated
using (
  driver_id = auth.uid()
  or exists (
    select 1
    from public.orders o
    join public.vendors v on v.id = o.vendor_id
    where o.id = deliveries.order_id and v.owner_id = auth.uid()
  )
);

drop policy if exists "order_handoffs_select_participants" on public.order_handoffs;
create policy "order_handoffs_select_participants" on public.order_handoffs
for select to authenticated
using (
  exists (
    select 1
    from public.orders o
    left join public.deliveries d on d.order_id = o.id
    left join public.vendors v on v.id = o.vendor_id
    where o.id = order_handoffs.order_id
      and (o.customer_id = auth.uid() or v.owner_id = auth.uid() or d.driver_id = auth.uid())
  )
);

drop policy if exists "order_handoffs_update_driver_or_vendor" on public.order_handoffs;
create policy "order_handoffs_update_driver_or_vendor" on public.order_handoffs
for update to authenticated
using (
  exists (
    select 1
    from public.orders o
    left join public.deliveries d on d.order_id = o.id
    left join public.vendors v on v.id = o.vendor_id
    where o.id = order_handoffs.order_id
      and (v.owner_id = auth.uid() or d.driver_id = auth.uid())
  )
);

drop policy if exists "driver_locations_insert_self" on public.driver_locations;
create policy "driver_locations_insert_self" on public.driver_locations
for insert to authenticated
with check (driver_id = auth.uid());

drop policy if exists "driver_locations_select_participants" on public.driver_locations;
create policy "driver_locations_select_participants" on public.driver_locations
for select to authenticated
using (
  driver_id = auth.uid()
  or exists (
    select 1
    from public.deliveries d
    join public.orders o on o.id = d.order_id
    left join public.vendors v on v.id = o.vendor_id
    where d.driver_id = driver_locations.driver_id
      and (o.customer_id = auth.uid() or v.owner_id = auth.uid())
  )
);

drop policy if exists "trust_scores_read_all" on public.trust_scores;
create policy "trust_scores_read_all" on public.trust_scores
for select to authenticated
using (true);

drop policy if exists "vendor_conversations_select_participants" on public.vendor_conversations;
create policy "vendor_conversations_select_participants" on public.vendor_conversations
for select to authenticated
using (
  customer_id = auth.uid()
  or exists (
    select 1 from public.vendors v
    where v.id = vendor_conversations.vendor_id and v.owner_id = auth.uid()
  )
);

drop policy if exists "vendor_conversations_insert_customer_or_vendor" on public.vendor_conversations;
create policy "vendor_conversations_insert_customer_or_vendor" on public.vendor_conversations
for insert to authenticated
with check (
  customer_id = auth.uid()
  or exists (
    select 1 from public.vendors v
    where v.id = vendor_conversations.vendor_id and v.owner_id = auth.uid()
  )
);

drop policy if exists "vendor_messages_select_participants" on public.vendor_messages;
create policy "vendor_messages_select_participants" on public.vendor_messages
for select to authenticated
using (
  exists (
    select 1
    from public.vendor_conversations c
    left join public.vendors v on v.id = c.vendor_id
    where c.id = vendor_messages.conversation_id
      and (c.customer_id = auth.uid() or v.owner_id = auth.uid())
  )
);

drop policy if exists "vendor_messages_insert_participants" on public.vendor_messages;
create policy "vendor_messages_insert_participants" on public.vendor_messages
for insert to authenticated
with check (
  sender_id = auth.uid()
  and exists (
    select 1
    from public.vendor_conversations c
    left join public.vendors v on v.id = c.vendor_id
    where c.id = vendor_messages.conversation_id
      and (c.customer_id = auth.uid() or v.owner_id = auth.uid())
  )
);

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'orders'
  ) then
    alter publication supabase_realtime add table public.orders;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'deliveries'
  ) then
    alter publication supabase_realtime add table public.deliveries;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'order_handoffs'
  ) then
    alter publication supabase_realtime add table public.order_handoffs;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'vendor_messages'
  ) then
    alter publication supabase_realtime add table public.vendor_messages;
  end if;
end $$;
