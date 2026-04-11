-- New isolated backend for the new app
-- Safe to run in the same Supabase project: everything is namespaced under campus_market.

create extension if not exists pgcrypto;

create schema if not exists campus_market;

-- -------------------------------
-- Enums
-- -------------------------------
do $$ begin
  create type campus_market.user_role as enum ('customer', 'vendor', 'driver', 'admin');
exception when duplicate_object then null; end $$;

do $$ begin
  create type campus_market.channel as enum ('market', 'food');
exception when duplicate_object then null; end $$;

do $$ begin
  create type campus_market.order_status as enum (
    'pending',
    'accepted',
    'preparing',
    'picked_up',
    'on_the_way',
    'delivered',
    'cancelled'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type campus_market.delivery_mode as enum ('pickup', 'doorstep');
exception when duplicate_object then null; end $$;

do $$ begin
  create type campus_market.delivery_status as enum (
    'searching',
    'assigned',
    'picked_up',
    'arriving',
    'delivered',
    'failed',
    'cancelled'
  );
exception when duplicate_object then null; end $$;

-- -------------------------------
-- Tables
-- -------------------------------
create table if not exists campus_market.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  phone text,
  role campus_market.user_role not null default 'customer',
  campus text,
  area text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists campus_market.vendors (
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

create index if not exists idx_campus_market_vendors_owner_id on campus_market.vendors(owner_id);
create index if not exists idx_campus_market_vendors_campus on campus_market.vendors(campus);

create table if not exists campus_market.catalog_items (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references campus_market.vendors(id) on delete cascade,
  channel campus_market.channel not null,
  name text not null,
  description text,
  price_mwk numeric(12,2) not null check (price_mwk >= 0),
  stock_qty integer,
  image_url text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_campus_market_items_vendor_id on campus_market.catalog_items(vendor_id);
create index if not exists idx_campus_market_items_channel on campus_market.catalog_items(channel);
create index if not exists idx_campus_market_items_active on campus_market.catalog_items(is_active);

create table if not exists campus_market.orders (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references auth.users(id) on delete cascade,
  vendor_id uuid not null references campus_market.vendors(id) on delete restrict,
  channel campus_market.channel not null,
  status campus_market.order_status not null default 'pending',
  delivery_mode campus_market.delivery_mode not null default 'pickup',
  pickup_notes text,
  dropoff_notes text,
  pickup_latitude double precision,
  pickup_longitude double precision,
  dropoff_latitude double precision,
  dropoff_longitude double precision,
  subtotal_mwk numeric(12,2) not null default 0,
  delivery_fee_mwk numeric(12,2) not null default 0,
  service_fee_mwk numeric(12,2) not null default 0,
  total_mwk numeric(12,2) not null default 0,
  payment_status text not null default 'unpaid',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_campus_market_orders_customer_id on campus_market.orders(customer_id);
create index if not exists idx_campus_market_orders_vendor_id on campus_market.orders(vendor_id);
create index if not exists idx_campus_market_orders_status on campus_market.orders(status);

create table if not exists campus_market.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references campus_market.orders(id) on delete cascade,
  item_id uuid not null references campus_market.catalog_items(id) on delete restrict,
  item_name_snapshot text not null,
  quantity integer not null check (quantity > 0),
  unit_price_mwk numeric(12,2) not null check (unit_price_mwk >= 0),
  line_total_mwk numeric(12,2) not null check (line_total_mwk >= 0),
  created_at timestamptz not null default now()
);

create index if not exists idx_campus_market_order_items_order_id on campus_market.order_items(order_id);

create table if not exists campus_market.deliveries (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references campus_market.orders(id) on delete cascade,
  driver_id uuid references auth.users(id) on delete set null,
  status campus_market.delivery_status not null default 'searching',
  eta_minutes integer,
  current_latitude double precision,
  current_longitude double precision,
  proof_photo_url text,
  delivered_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_campus_market_deliveries_driver_id on campus_market.deliveries(driver_id);
create index if not exists idx_campus_market_deliveries_status on campus_market.deliveries(status);

create table if not exists campus_market.order_handoffs (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references campus_market.orders(id) on delete cascade,
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

create index if not exists idx_campus_market_order_handoffs_order_id on campus_market.order_handoffs(order_id);
create index if not exists idx_campus_market_order_handoffs_payment_id on campus_market.order_handoffs(payment_id);
create index if not exists idx_campus_market_order_handoffs_verified_at on campus_market.order_handoffs(verified_at desc);

create table if not exists campus_market.driver_locations (
  id uuid primary key default gen_random_uuid(),
  driver_id uuid not null references auth.users(id) on delete cascade,
  latitude double precision not null,
  longitude double precision not null,
  heading double precision,
  speed_kph double precision,
  recorded_at timestamptz not null default now()
);

create index if not exists idx_campus_market_driver_locations_driver_time on campus_market.driver_locations(driver_id, recorded_at desc);

create table if not exists campus_market.trust_scores (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null check (entity_type in ('vendor', 'driver', 'customer')),
  entity_id uuid not null,
  score numeric(5,2) not null check (score >= 0 and score <= 100),
  order_success_rate numeric(5,2),
  dispute_rate numeric(5,2),
  avg_rating numeric(4,2),
  updated_at timestamptz not null default now(),
  unique (entity_type, entity_id)
);

-- -------------------------------
-- Updated_at helper
-- -------------------------------
create or replace function campus_market.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_profiles_updated_at on campus_market.profiles;
create trigger trg_profiles_updated_at
before update on campus_market.profiles
for each row execute function campus_market.set_updated_at();

drop trigger if exists trg_vendors_updated_at on campus_market.vendors;
create trigger trg_vendors_updated_at
before update on campus_market.vendors
for each row execute function campus_market.set_updated_at();

drop trigger if exists trg_catalog_items_updated_at on campus_market.catalog_items;
create trigger trg_catalog_items_updated_at
before update on campus_market.catalog_items
for each row execute function campus_market.set_updated_at();

drop trigger if exists trg_orders_updated_at on campus_market.orders;
create trigger trg_orders_updated_at
before update on campus_market.orders
for each row execute function campus_market.set_updated_at();

drop trigger if exists trg_deliveries_updated_at on campus_market.deliveries;
create trigger trg_deliveries_updated_at
before update on campus_market.deliveries
for each row execute function campus_market.set_updated_at();

drop trigger if exists trg_order_handoffs_updated_at on campus_market.order_handoffs;
create trigger trg_order_handoffs_updated_at
before update on campus_market.order_handoffs
for each row execute function campus_market.set_updated_at();

-- -------------------------------
-- Grants
-- -------------------------------
grant usage on schema campus_market to anon, authenticated, service_role;
grant all on all tables in schema campus_market to service_role;
grant select, insert, update, delete on all tables in schema campus_market to authenticated;
grant select on all tables in schema campus_market to anon;

-- -------------------------------
-- RLS
-- -------------------------------
alter table campus_market.profiles enable row level security;
alter table campus_market.vendors enable row level security;
alter table campus_market.catalog_items enable row level security;
alter table campus_market.orders enable row level security;
alter table campus_market.order_items enable row level security;
alter table campus_market.deliveries enable row level security;
alter table campus_market.order_handoffs enable row level security;
alter table campus_market.driver_locations enable row level security;
alter table campus_market.trust_scores enable row level security;

-- Profiles
drop policy if exists "profiles_select_own" on campus_market.profiles;
create policy "profiles_select_own" on campus_market.profiles
for select to authenticated
using (id = auth.uid());

drop policy if exists "profiles_insert_own" on campus_market.profiles;
create policy "profiles_insert_own" on campus_market.profiles
for insert to authenticated
with check (id = auth.uid());

drop policy if exists "profiles_update_own" on campus_market.profiles;
create policy "profiles_update_own" on campus_market.profiles
for update to authenticated
using (id = auth.uid())
with check (id = auth.uid());

-- Vendors
drop policy if exists "vendors_public_select_active" on campus_market.vendors;
create policy "vendors_public_select_active" on campus_market.vendors
for select
using (is_active = true or owner_id = auth.uid());

drop policy if exists "vendors_insert_owner" on campus_market.vendors;
create policy "vendors_insert_owner" on campus_market.vendors
for insert to authenticated
with check (owner_id = auth.uid());

drop policy if exists "vendors_update_owner" on campus_market.vendors;
create policy "vendors_update_owner" on campus_market.vendors
for update to authenticated
using (owner_id = auth.uid())
with check (owner_id = auth.uid());

-- Catalog items
drop policy if exists "items_public_select_active" on campus_market.catalog_items;
create policy "items_public_select_active" on campus_market.catalog_items
for select
using (
  is_active = true
  and exists (
    select 1
    from campus_market.vendors v
    where v.id = catalog_items.vendor_id
      and v.is_active = true
  )
);

drop policy if exists "items_owner_manage" on campus_market.catalog_items;
create policy "items_owner_manage" on campus_market.catalog_items
for all to authenticated
using (
  exists (
    select 1
    from campus_market.vendors v
    where v.id = catalog_items.vendor_id
      and v.owner_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from campus_market.vendors v
    where v.id = catalog_items.vendor_id
      and v.owner_id = auth.uid()
  )
);

-- Orders
drop policy if exists "orders_insert_customer" on campus_market.orders;
create policy "orders_insert_customer" on campus_market.orders
for insert to authenticated
with check (customer_id = auth.uid());

drop policy if exists "orders_select_participants" on campus_market.orders;
create policy "orders_select_participants" on campus_market.orders
for select to authenticated
using (
  customer_id = auth.uid()
  or exists (
    select 1 from campus_market.vendors v
    where v.id = orders.vendor_id and v.owner_id = auth.uid()
  )
  or exists (
    select 1 from campus_market.deliveries d
    where d.order_id = orders.id and d.driver_id = auth.uid()
  )
);

drop policy if exists "orders_update_vendor_or_driver" on campus_market.orders;
create policy "orders_update_vendor_or_driver" on campus_market.orders
for update to authenticated
using (
  exists (
    select 1 from campus_market.vendors v
    where v.id = orders.vendor_id and v.owner_id = auth.uid()
  )
  or exists (
    select 1 from campus_market.deliveries d
    where d.order_id = orders.id and d.driver_id = auth.uid()
  )
)
with check (true);

-- Order items
drop policy if exists "order_items_select_participants" on campus_market.order_items;
create policy "order_items_select_participants" on campus_market.order_items
for select to authenticated
using (
  exists (
    select 1 from campus_market.orders o
    left join campus_market.deliveries d on d.order_id = o.id
    left join campus_market.vendors v on v.id = o.vendor_id
    where o.id = order_items.order_id
      and (
        o.customer_id = auth.uid()
        or v.owner_id = auth.uid()
        or d.driver_id = auth.uid()
      )
  )
);

drop policy if exists "order_items_insert_customer" on campus_market.order_items;
create policy "order_items_insert_customer" on campus_market.order_items
for insert to authenticated
with check (
  exists (
    select 1 from campus_market.orders o
    where o.id = order_items.order_id and o.customer_id = auth.uid()
  )
);

-- Deliveries
drop policy if exists "deliveries_select_participants" on campus_market.deliveries;
create policy "deliveries_select_participants" on campus_market.deliveries
for select to authenticated
using (
  driver_id = auth.uid()
  or exists (
    select 1 from campus_market.orders o
    left join campus_market.vendors v on v.id = o.vendor_id
    where o.id = deliveries.order_id
      and (o.customer_id = auth.uid() or v.owner_id = auth.uid())
  )
);

drop policy if exists "deliveries_insert_vendor" on campus_market.deliveries;
create policy "deliveries_insert_vendor" on campus_market.deliveries
for insert to authenticated
with check (
  exists (
    select 1 from campus_market.orders o
    join campus_market.vendors v on v.id = o.vendor_id
    where o.id = deliveries.order_id and v.owner_id = auth.uid()
  )
);

drop policy if exists "deliveries_update_driver_or_vendor" on campus_market.deliveries;
create policy "deliveries_update_driver_or_vendor" on campus_market.deliveries
for update to authenticated
using (
  driver_id = auth.uid()
  or exists (
    select 1 from campus_market.orders o
    join campus_market.vendors v on v.id = o.vendor_id
    where o.id = deliveries.order_id and v.owner_id = auth.uid()
  )
)
with check (true);

drop policy if exists "order_handoffs_select_participants" on campus_market.order_handoffs;
create policy "order_handoffs_select_participants" on campus_market.order_handoffs
for select to authenticated
using (
  exists (
    select 1
    from campus_market.orders o
    left join campus_market.deliveries d on d.order_id = o.id
    left join campus_market.vendors v on v.id = o.vendor_id
    where o.id = order_handoffs.order_id
      and (
        o.customer_id = auth.uid()
        or v.owner_id = auth.uid()
        or d.driver_id = auth.uid()
      )
  )
);

drop policy if exists "order_handoffs_update_driver_or_vendor" on campus_market.order_handoffs;
create policy "order_handoffs_update_driver_or_vendor" on campus_market.order_handoffs
for update to authenticated
using (
  exists (
    select 1
    from campus_market.orders o
    left join campus_market.deliveries d on d.order_id = o.id
    left join campus_market.vendors v on v.id = o.vendor_id
    where o.id = order_handoffs.order_id
      and (
        d.driver_id = auth.uid()
        or v.owner_id = auth.uid()
      )
  )
)
with check (true);

-- Driver locations
drop policy if exists "driver_locations_insert_self" on campus_market.driver_locations;
create policy "driver_locations_insert_self" on campus_market.driver_locations
for insert to authenticated
with check (driver_id = auth.uid());

drop policy if exists "driver_locations_select_participants" on campus_market.driver_locations;
create policy "driver_locations_select_participants" on campus_market.driver_locations
for select to authenticated
using (
  driver_id = auth.uid()
  or exists (
    select 1
    from campus_market.deliveries d
    join campus_market.orders o on o.id = d.order_id
    left join campus_market.vendors v on v.id = o.vendor_id
    where d.driver_id = driver_locations.driver_id
      and (
        o.customer_id = auth.uid()
        or v.owner_id = auth.uid()
      )
  )
);

-- Trust scores are public read, admin/service role writes.
drop policy if exists "trust_scores_read_all" on campus_market.trust_scores;
create policy "trust_scores_read_all" on campus_market.trust_scores
for select
using (true);

-- -------------------------------
-- Realtime (optional)
-- -------------------------------
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'campus_market'
      and tablename = 'orders'
  ) then
    alter publication supabase_realtime add table campus_market.orders;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'campus_market'
      and tablename = 'deliveries'
  ) then
    alter publication supabase_realtime add table campus_market.deliveries;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'campus_market'
      and tablename = 'order_handoffs'
  ) then
    alter publication supabase_realtime add table campus_market.order_handoffs;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'campus_market'
      and tablename = 'driver_locations'
  ) then
    alter publication supabase_realtime add table campus_market.driver_locations;
  end if;
end $$;
