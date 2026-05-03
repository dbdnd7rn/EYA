-- Full project schema for a fresh Supabase/Postgres setup.
-- Consolidated from the current app code and existing SQL files.

create extension if not exists pgcrypto;

create or replace function public.set_updated_at_column()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  first_name text,
  last_name text,
  surname text,
  email text,
  phone text,
  avatar_url text,
  role text not null default 'student',
  onboarded boolean not null default false,
  campus text,
  area text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_role_check check (role in ('student', 'landlord', 'agent', 'admin'))
);

create table if not exists public.listings (
  id uuid primary key default gen_random_uuid(),
  landlord_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  listing_type text not null check (listing_type in ('hostel', 'bedsitter')),
  campus text,
  area text,
  city text,
  price_from numeric(12,2) check (price_from is null or price_from >= 0),
  total_rooms integer check (total_rooms is null or total_rooms >= 0),
  room_types text[],
  description text,
  contact_phone text not null,
  contact_method text not null default 'whatsapp' check (contact_method in ('whatsapp', 'call', 'both')),
  water_billing text check (water_billing is null or water_billing in ('inclusive', 'exclusive')),
  electricity_billing text check (electricity_billing is null or electricity_billing in ('inclusive', 'exclusive')),
  gender_policy text check (gender_policy is null or gender_policy in ('boys', 'girls', 'both')),
  occupancy_mode text check (occupancy_mode is null or occupancy_mode in ('single', 'shared')),
  students_per_room integer check (students_per_room is null or students_per_room > 0),
  rules text[] not null default '{}'::text[],
  amenities text[] not null default '{}'::text[],
  image_urls text[] not null default '{}'::text[],
  latitude double precision,
  longitude double precision,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.enquiries (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references auth.users(id) on delete cascade,
  landlord_id uuid not null references auth.users(id) on delete cascade,
  listing_id uuid not null references public.listings(id) on delete cascade,
  message text,
  status text not null default 'new' check (status in ('new', 'open', 'read', 'replied', 'closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  enquiry_id uuid not null references public.enquiries(id) on delete cascade,
  sender_id uuid references auth.users(id) on delete set null,
  receiver_id uuid references auth.users(id) on delete set null,
  sender_role text not null check (sender_role in ('student', 'landlord', 'agent', 'admin')),
  receiver_role text not null check (receiver_role in ('student', 'landlord', 'agent', 'admin')),
  content text,
  message_type text not null default 'text' check (message_type in ('text', 'image')),
  image_url text,
  created_at timestamptz not null default now(),
  check (
    (message_type = 'text' and content is not null)
    or (message_type = 'image' and image_url is not null)
  )
);

create table if not exists public.reviews (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings(id) on delete cascade,
  student_id uuid not null references auth.users(id) on delete cascade,
  landlord_id uuid references auth.users(id) on delete set null,
  rating integer not null check (rating between 1 and 5),
  comment text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (student_id, listing_id)
);

create table if not exists public.saved_rooms (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references auth.users(id) on delete cascade,
  listing_id uuid not null references public.listings(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (student_id, listing_id)
);

create table if not exists public.listing_reports (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings(id) on delete cascade,
  reporter_id uuid not null references auth.users(id) on delete cascade,
  category text not null,
  message text not null,
  status text not null default 'open' check (status in ('open', 'in_review', 'resolved', 'dismissed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.landlord_verifications (
  id uuid primary key default gen_random_uuid(),
  landlord_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'verified', 'rejected', 'expired')),
  requested_at timestamptz not null default now(),
  verified_at timestamptz,
  expires_at timestamptz,
  rejection_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace view public.landlord_public_verification as
select distinct on (lv.landlord_id)
  lv.landlord_id,
  (lv.status = 'verified' and (lv.expires_at is null or lv.expires_at > now())) as is_verified,
  lv.status,
  lv.verified_at,
  lv.expires_at
from public.landlord_verifications lv
order by lv.landlord_id, lv.requested_at desc, lv.created_at desc;

create table if not exists public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null check (type in ('report_listing', 'message_us', 'suggestion')),
  listing_id uuid references public.listings(id) on delete set null,
  subject text,
  message text not null,
  email text,
  phone text,
  name text,
  status text not null default 'new' check (status in ('new', 'open', 'resolved', 'closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.wallet_accounts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  balance_mwk integer not null default 0 check (balance_mwk >= 0),
  points integer not null default 0 check (points >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.wallet_activities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  label text not null,
  amount_mwk integer not null,
  type text not null check (type in ('topup', 'payment', 'reward')),
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  related_order_id uuid,
  related_enquiry_id uuid,
  related_listing_id uuid,
  project text not null default 'eya',
  provider text not null default 'paychangu',
  method text not null check (method in ('airtel_money', 'mpamba', 'bank_transfer')),
  reference text not null unique,
  external_reference text,
  currency text not null default 'MWK',
  amount_mwk numeric(12,2) not null check (amount_mwk >= 0),
  title text,
  description text not null,
  customer_email text,
  customer_phone text,
  customer_first_name text,
  customer_last_name text,
  checkout_url text,
  status text not null default 'initiated' check (status in ('initiated', 'pending', 'paid', 'failed', 'cancelled', 'refunded')),
  metadata jsonb not null default '{}'::jsonb,
  provider_payload jsonb not null default '{}'::jsonb,
  verified_at timestamptz,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.payment_events (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references public.payments(id) on delete cascade,
  event_type text not null,
  status text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.pricing_plans (
  id uuid primary key default gen_random_uuid(),
  tier text not null unique check (tier in ('Starter', 'Growth', 'Pro')),
  audiences text[] not null default '{}'::text[],
  monthly_label text not null,
  description text not null,
  features text[] not null default '{}'::text[],
  cta text not null,
  route text not null,
  goal_weights jsonb not null default '{}'::jsonb,
  sort_order integer not null default 100,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.pricing_testimonials (
  id uuid primary key default gen_random_uuid(),
  quote text not null,
  byline text not null,
  sort_order integer not null default 100,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.pricing_case_studies (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  metric text not null,
  detail text not null,
  sort_order integer not null default 100,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.pricing_faqs (
  id uuid primary key default gen_random_uuid(),
  question text not null,
  answer text not null,
  sort_order integer not null default 100,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.app_runtime_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  event_type text not null,
  level text not null default 'info' check (level in ('info', 'warn', 'error')),
  message text not null,
  context jsonb not null default '{}'::jsonb,
  app_env text,
  created_at timestamptz not null default now()
);

create table if not exists public.push_notification_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  device_id text not null,
  push_token text not null,
  platform text not null,
  is_active boolean not null default true,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, device_id)
);

create table if not exists public.trust_safety_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references auth.users(id) on delete cascade,
  subject_type text not null,
  subject_id uuid,
  category text not null,
  details text not null,
  related_enquiry_id uuid,
  related_order_id uuid,
  status text not null default 'open' check (status in ('open', 'in_review', 'resolved', 'dismissed')),
  admin_notes text,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create schema if not exists campus_market;

do $$ begin
  create type campus_market.user_role as enum ('customer', 'vendor', 'driver', 'admin');
exception when duplicate_object then null; end $$;

do $$ begin
  create type campus_market.channel as enum ('market', 'food');
exception when duplicate_object then null; end $$;

do $$ begin
  create type campus_market.order_status as enum (
    'pending', 'accepted', 'preparing', 'picked_up', 'on_the_way', 'delivered', 'cancelled'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type campus_market.delivery_mode as enum ('pickup', 'doorstep');
exception when duplicate_object then null; end $$;

do $$ begin
  create type campus_market.delivery_status as enum (
    'searching', 'assigned', 'picked_up', 'arriving', 'delivered', 'failed', 'cancelled'
  );
exception when duplicate_object then null; end $$;

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

create table if not exists campus_market.driver_locations (
  id uuid primary key default gen_random_uuid(),
  driver_id uuid not null references auth.users(id) on delete cascade,
  latitude double precision not null,
  longitude double precision not null,
  heading double precision,
  speed_kph double precision,
  recorded_at timestamptz not null default now()
);

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

create or replace function campus_market.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role = 'admin'
  );
$$;

create index if not exists idx_listings_landlord_id on public.listings(landlord_id);
create index if not exists idx_listings_active on public.listings(is_active);
create index if not exists idx_listings_area_city on public.listings(area, city);
create index if not exists idx_listings_campus on public.listings(campus);
create index if not exists idx_listings_created_at on public.listings(created_at desc);
create index if not exists idx_enquiries_student_id on public.enquiries(student_id);
create index if not exists idx_enquiries_landlord_id on public.enquiries(landlord_id);
create index if not exists idx_enquiries_listing_id on public.enquiries(listing_id);
create index if not exists idx_enquiries_created_at on public.enquiries(created_at desc);
create index if not exists idx_messages_enquiry_id on public.messages(enquiry_id, created_at asc);
create index if not exists idx_reviews_listing_id on public.reviews(listing_id);
create index if not exists idx_saved_rooms_student_id on public.saved_rooms(student_id);
create index if not exists idx_listing_reports_listing_id on public.listing_reports(listing_id);
create index if not exists idx_listing_reports_reporter_id on public.listing_reports(reporter_id);
create index if not exists idx_landlord_verifications_landlord_id on public.landlord_verifications(landlord_id, requested_at desc);
create index if not exists idx_support_tickets_user_id on public.support_tickets(user_id);
create index if not exists idx_support_tickets_status on public.support_tickets(status);
create index if not exists idx_wallet_activities_user_created_at on public.wallet_activities(user_id, created_at desc);
create index if not exists idx_payments_user_id on public.payments(user_id);
create index if not exists idx_payments_status on public.payments(status);
create index if not exists idx_payment_events_payment_id on public.payment_events(payment_id, created_at desc);
create index if not exists idx_app_runtime_events_user_id on public.app_runtime_events(user_id);
create index if not exists idx_app_runtime_events_created_at on public.app_runtime_events(created_at desc);
create index if not exists idx_push_notification_tokens_user_id on public.push_notification_tokens(user_id);
create index if not exists idx_trust_safety_reports_reporter_id on public.trust_safety_reports(reporter_id);
create index if not exists idx_trust_safety_reports_status on public.trust_safety_reports(status);
create index if not exists idx_trust_safety_reports_created_at on public.trust_safety_reports(created_at desc);
create index if not exists idx_campus_market_vendors_owner_id on campus_market.vendors(owner_id);
create index if not exists idx_campus_market_vendors_campus on campus_market.vendors(campus);
create index if not exists idx_campus_market_items_vendor_id on campus_market.catalog_items(vendor_id);
create index if not exists idx_campus_market_items_channel on campus_market.catalog_items(channel);
create index if not exists idx_campus_market_items_active on campus_market.catalog_items(is_active);
create index if not exists idx_campus_market_orders_customer_id on campus_market.orders(customer_id);
create index if not exists idx_campus_market_orders_vendor_id on campus_market.orders(vendor_id);
create index if not exists idx_campus_market_orders_status on campus_market.orders(status);
create index if not exists idx_campus_market_order_items_order_id on campus_market.order_items(order_id);
create index if not exists idx_campus_market_deliveries_driver_id on campus_market.deliveries(driver_id);
create index if not exists idx_campus_market_deliveries_status on campus_market.deliveries(status);
create index if not exists idx_campus_market_order_handoffs_order_id on campus_market.order_handoffs(order_id);
create index if not exists idx_campus_market_order_handoffs_payment_id on campus_market.order_handoffs(payment_id);
create index if not exists idx_campus_market_order_handoffs_verified_at on campus_market.order_handoffs(verified_at desc);
create index if not exists idx_campus_market_driver_locations_driver_time on campus_market.driver_locations(driver_id, recorded_at desc);

drop trigger if exists trg_profiles_updated_at on public.profiles;
create trigger trg_profiles_updated_at before update on public.profiles for each row execute function public.set_updated_at_column();
drop trigger if exists trg_listings_updated_at on public.listings;
create trigger trg_listings_updated_at before update on public.listings for each row execute function public.set_updated_at_column();
drop trigger if exists trg_enquiries_updated_at on public.enquiries;
create trigger trg_enquiries_updated_at before update on public.enquiries for each row execute function public.set_updated_at_column();
drop trigger if exists trg_reviews_updated_at on public.reviews;
create trigger trg_reviews_updated_at before update on public.reviews for each row execute function public.set_updated_at_column();
drop trigger if exists trg_listing_reports_updated_at on public.listing_reports;
create trigger trg_listing_reports_updated_at before update on public.listing_reports for each row execute function public.set_updated_at_column();
drop trigger if exists trg_landlord_verifications_updated_at on public.landlord_verifications;
create trigger trg_landlord_verifications_updated_at before update on public.landlord_verifications for each row execute function public.set_updated_at_column();
drop trigger if exists trg_support_tickets_updated_at on public.support_tickets;
create trigger trg_support_tickets_updated_at before update on public.support_tickets for each row execute function public.set_updated_at_column();
drop trigger if exists trg_wallet_accounts_updated_at on public.wallet_accounts;
create trigger trg_wallet_accounts_updated_at before update on public.wallet_accounts for each row execute function public.set_updated_at_column();
drop trigger if exists trg_payments_updated_at on public.payments;
create trigger trg_payments_updated_at before update on public.payments for each row execute function public.set_updated_at_column();
drop trigger if exists trg_pricing_plans_updated_at on public.pricing_plans;
create trigger trg_pricing_plans_updated_at before update on public.pricing_plans for each row execute function public.set_updated_at_column();
drop trigger if exists trg_pricing_testimonials_updated_at on public.pricing_testimonials;
create trigger trg_pricing_testimonials_updated_at before update on public.pricing_testimonials for each row execute function public.set_updated_at_column();
drop trigger if exists trg_pricing_case_studies_updated_at on public.pricing_case_studies;
create trigger trg_pricing_case_studies_updated_at before update on public.pricing_case_studies for each row execute function public.set_updated_at_column();
drop trigger if exists trg_pricing_faqs_updated_at on public.pricing_faqs;
create trigger trg_pricing_faqs_updated_at before update on public.pricing_faqs for each row execute function public.set_updated_at_column();
drop trigger if exists trg_push_notification_tokens_updated_at on public.push_notification_tokens;
create trigger trg_push_notification_tokens_updated_at before update on public.push_notification_tokens for each row execute function public.set_updated_at_column();
drop trigger if exists trg_trust_safety_reports_updated_at on public.trust_safety_reports;
create trigger trg_trust_safety_reports_updated_at before update on public.trust_safety_reports for each row execute function public.set_updated_at_column();
drop trigger if exists trg_campus_market_profiles_updated_at on campus_market.profiles;
create trigger trg_campus_market_profiles_updated_at before update on campus_market.profiles for each row execute function campus_market.set_updated_at();
drop trigger if exists trg_campus_market_vendors_updated_at on campus_market.vendors;
create trigger trg_campus_market_vendors_updated_at before update on campus_market.vendors for each row execute function campus_market.set_updated_at();
drop trigger if exists trg_campus_market_catalog_items_updated_at on campus_market.catalog_items;
create trigger trg_campus_market_catalog_items_updated_at before update on campus_market.catalog_items for each row execute function campus_market.set_updated_at();
drop trigger if exists trg_campus_market_orders_updated_at on campus_market.orders;
create trigger trg_campus_market_orders_updated_at before update on campus_market.orders for each row execute function campus_market.set_updated_at();
drop trigger if exists trg_campus_market_deliveries_updated_at on campus_market.deliveries;
create trigger trg_campus_market_deliveries_updated_at before update on campus_market.deliveries for each row execute function campus_market.set_updated_at();
drop trigger if exists trg_campus_market_order_handoffs_updated_at on campus_market.order_handoffs;
create trigger trg_campus_market_order_handoffs_updated_at before update on campus_market.order_handoffs for each row execute function campus_market.set_updated_at();

grant usage on schema public to anon, authenticated, service_role;
grant usage on schema campus_market to anon, authenticated, service_role;
grant select on public.landlord_public_verification to anon, authenticated;
grant select on public.listings, public.reviews, public.pricing_plans, public.pricing_testimonials, public.pricing_case_studies, public.pricing_faqs, public.landlord_public_verification to anon, authenticated;
grant select, insert, update, delete on public.profiles to authenticated;
grant select, insert, update, delete on public.listings to authenticated;
grant select, insert, update on public.enquiries to authenticated;
grant select, insert on public.messages to authenticated;
grant select, insert, update, delete on public.reviews to authenticated;
grant select, insert, delete on public.saved_rooms to authenticated;
grant select, insert on public.listing_reports to authenticated;
grant select, insert on public.landlord_verifications to authenticated;
grant select, insert on public.support_tickets to authenticated;
grant select, insert, update on public.wallet_accounts to authenticated;
grant select, insert on public.wallet_activities to authenticated;
grant select, insert on public.payments to authenticated;
grant select on public.payment_events to authenticated;
grant insert on public.app_runtime_events to anon, authenticated;
grant select, insert, update on public.push_notification_tokens to authenticated;
grant select, insert on public.trust_safety_reports to authenticated;
grant all on all tables in schema public to service_role;
grant all on all tables in schema campus_market to service_role;
grant select, insert, update, delete on all tables in schema campus_market to authenticated;
grant select on all tables in schema campus_market to anon;

alter table public.profiles enable row level security;
alter table public.listings enable row level security;
alter table public.enquiries enable row level security;
alter table public.messages enable row level security;
alter table public.reviews enable row level security;
alter table public.saved_rooms enable row level security;
alter table public.listing_reports enable row level security;
alter table public.landlord_verifications enable row level security;
alter table public.support_tickets enable row level security;
alter table public.wallet_accounts enable row level security;
alter table public.wallet_activities enable row level security;
alter table public.payments enable row level security;
alter table public.payment_events enable row level security;
alter table public.pricing_plans enable row level security;
alter table public.pricing_testimonials enable row level security;
alter table public.pricing_case_studies enable row level security;
alter table public.pricing_faqs enable row level security;
alter table public.app_runtime_events enable row level security;
alter table public.push_notification_tokens enable row level security;
alter table public.trust_safety_reports enable row level security;
alter table campus_market.profiles enable row level security;
alter table campus_market.vendors enable row level security;
alter table campus_market.catalog_items enable row level security;
alter table campus_market.orders enable row level security;
alter table campus_market.order_items enable row level security;
alter table campus_market.deliveries enable row level security;
alter table campus_market.order_handoffs enable row level security;
alter table campus_market.driver_locations enable row level security;
alter table campus_market.trust_scores enable row level security;

drop policy if exists "profiles_select_own_or_admin" on public.profiles;
create policy "profiles_select_own_or_admin" on public.profiles for select to authenticated using (id = auth.uid() or public.is_admin());
drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own" on public.profiles for insert to authenticated with check (id = auth.uid());
drop policy if exists "profiles_update_own_or_admin" on public.profiles;
create policy "profiles_update_own_or_admin" on public.profiles for update to authenticated using (id = auth.uid() or public.is_admin()) with check (id = auth.uid() or public.is_admin());

drop policy if exists "listings_public_read_active" on public.listings;
create policy "listings_public_read_active" on public.listings for select using (is_active = true or landlord_id = auth.uid() or public.is_admin());
drop policy if exists "listings_landlord_insert" on public.listings;
create policy "listings_landlord_insert" on public.listings for insert to authenticated with check (landlord_id = auth.uid());
drop policy if exists "listings_landlord_update" on public.listings;
create policy "listings_landlord_update" on public.listings for update to authenticated using (landlord_id = auth.uid() or public.is_admin()) with check (landlord_id = auth.uid() or public.is_admin());
drop policy if exists "listings_landlord_delete" on public.listings;
create policy "listings_landlord_delete" on public.listings for delete to authenticated using (landlord_id = auth.uid() or public.is_admin());

drop policy if exists "enquiries_participant_read" on public.enquiries;
create policy "enquiries_participant_read" on public.enquiries for select to authenticated using (student_id = auth.uid() or landlord_id = auth.uid() or public.is_admin());
drop policy if exists "enquiries_student_insert" on public.enquiries;
create policy "enquiries_student_insert" on public.enquiries for insert to authenticated with check (student_id = auth.uid());
drop policy if exists "enquiries_participant_update" on public.enquiries;
create policy "enquiries_participant_update" on public.enquiries for update to authenticated using (student_id = auth.uid() or landlord_id = auth.uid() or public.is_admin()) with check (student_id = auth.uid() or landlord_id = auth.uid() or public.is_admin());

drop policy if exists "messages_participant_read" on public.messages;
create policy "messages_participant_read" on public.messages for select to authenticated using (exists (select 1 from public.enquiries e where e.id = messages.enquiry_id and (e.student_id = auth.uid() or e.landlord_id = auth.uid() or public.is_admin())));
drop policy if exists "messages_participant_insert" on public.messages;
create policy "messages_participant_insert" on public.messages for insert to authenticated with check (sender_id = auth.uid() and exists (select 1 from public.enquiries e where e.id = messages.enquiry_id and (e.student_id = auth.uid() or e.landlord_id = auth.uid() or public.is_admin())));

drop policy if exists "reviews_public_read" on public.reviews;
create policy "reviews_public_read" on public.reviews for select using (true);
drop policy if exists "reviews_student_write" on public.reviews;
create policy "reviews_student_write" on public.reviews for all to authenticated using (student_id = auth.uid() or public.is_admin()) with check (student_id = auth.uid() or public.is_admin());

drop policy if exists "saved_rooms_select_own" on public.saved_rooms;
create policy "saved_rooms_select_own" on public.saved_rooms for select to authenticated using (student_id = auth.uid() or public.is_admin());
drop policy if exists "saved_rooms_insert_own" on public.saved_rooms;
create policy "saved_rooms_insert_own" on public.saved_rooms for insert to authenticated with check (student_id = auth.uid());
drop policy if exists "saved_rooms_delete_own" on public.saved_rooms;
create policy "saved_rooms_delete_own" on public.saved_rooms for delete to authenticated using (student_id = auth.uid() or public.is_admin());

drop policy if exists "listing_reports_insert_own" on public.listing_reports;
create policy "listing_reports_insert_own" on public.listing_reports for insert to authenticated with check (reporter_id = auth.uid());
drop policy if exists "listing_reports_select_own_or_admin" on public.listing_reports;
create policy "listing_reports_select_own_or_admin" on public.listing_reports for select to authenticated using (reporter_id = auth.uid() or public.is_admin());
drop policy if exists "listing_reports_update_admin" on public.listing_reports;
create policy "listing_reports_update_admin" on public.listing_reports for update to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "landlord_verifications_select_own_or_admin" on public.landlord_verifications;
create policy "landlord_verifications_select_own_or_admin" on public.landlord_verifications for select to authenticated using (landlord_id = auth.uid() or public.is_admin());
drop policy if exists "landlord_verifications_insert_own" on public.landlord_verifications;
create policy "landlord_verifications_insert_own" on public.landlord_verifications for insert to authenticated with check (landlord_id = auth.uid() or public.is_admin());
drop policy if exists "landlord_verifications_update_admin" on public.landlord_verifications;
create policy "landlord_verifications_update_admin" on public.landlord_verifications for update to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "support_tickets_select_own_or_admin" on public.support_tickets;
create policy "support_tickets_select_own_or_admin" on public.support_tickets for select to authenticated using (user_id = auth.uid() or public.is_admin());
drop policy if exists "support_tickets_insert_own" on public.support_tickets;
create policy "support_tickets_insert_own" on public.support_tickets for insert to authenticated with check (user_id = auth.uid());
drop policy if exists "support_tickets_update_admin" on public.support_tickets;
create policy "support_tickets_update_admin" on public.support_tickets for update to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "wallet_accounts_select_own" on public.wallet_accounts;
create policy "wallet_accounts_select_own" on public.wallet_accounts for select to authenticated using (auth.uid() = user_id or public.is_admin());
drop policy if exists "wallet_accounts_insert_own" on public.wallet_accounts;
create policy "wallet_accounts_insert_own" on public.wallet_accounts for insert to authenticated with check (auth.uid() = user_id or public.is_admin());
drop policy if exists "wallet_accounts_update_own" on public.wallet_accounts;
create policy "wallet_accounts_update_own" on public.wallet_accounts for update to authenticated using (auth.uid() = user_id or public.is_admin()) with check (auth.uid() = user_id or public.is_admin());
drop policy if exists "wallet_activities_select_own" on public.wallet_activities;
create policy "wallet_activities_select_own" on public.wallet_activities for select to authenticated using (auth.uid() = user_id or public.is_admin());
drop policy if exists "wallet_activities_insert_own" on public.wallet_activities;
create policy "wallet_activities_insert_own" on public.wallet_activities for insert to authenticated with check (auth.uid() = user_id or public.is_admin());

drop policy if exists "payments_select_own_or_admin" on public.payments;
create policy "payments_select_own_or_admin" on public.payments for select to authenticated using (user_id = auth.uid() or public.is_admin());
drop policy if exists "payments_insert_own_or_admin" on public.payments;
create policy "payments_insert_own_or_admin" on public.payments for insert to authenticated with check (user_id = auth.uid() or public.is_admin() or user_id is null);
drop policy if exists "payments_update_admin" on public.payments;
create policy "payments_update_admin" on public.payments for update to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists "payment_events_select_own_or_admin" on public.payment_events;
create policy "payment_events_select_own_or_admin" on public.payment_events for select to authenticated using (exists (select 1 from public.payments p where p.id = payment_events.payment_id and (p.user_id = auth.uid() or public.is_admin())));

drop policy if exists "pricing_plans_read_all" on public.pricing_plans;
create policy "pricing_plans_read_all" on public.pricing_plans for select to anon, authenticated using (is_active = true or public.is_admin());
drop policy if exists "pricing_testimonials_read_all" on public.pricing_testimonials;
create policy "pricing_testimonials_read_all" on public.pricing_testimonials for select to anon, authenticated using (is_active = true or public.is_admin());
drop policy if exists "pricing_case_studies_read_all" on public.pricing_case_studies;
create policy "pricing_case_studies_read_all" on public.pricing_case_studies for select to anon, authenticated using (is_active = true or public.is_admin());
drop policy if exists "pricing_faqs_read_all" on public.pricing_faqs;
create policy "pricing_faqs_read_all" on public.pricing_faqs for select to anon, authenticated using (is_active = true or public.is_admin());
drop policy if exists "pricing_plans_admin_write" on public.pricing_plans;
create policy "pricing_plans_admin_write" on public.pricing_plans for all to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists "pricing_testimonials_admin_write" on public.pricing_testimonials;
create policy "pricing_testimonials_admin_write" on public.pricing_testimonials for all to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists "pricing_case_studies_admin_write" on public.pricing_case_studies;
create policy "pricing_case_studies_admin_write" on public.pricing_case_studies for all to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists "pricing_faqs_admin_write" on public.pricing_faqs;
create policy "pricing_faqs_admin_write" on public.pricing_faqs for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "runtime_events_insert_client" on public.app_runtime_events;
create policy "runtime_events_insert_client" on public.app_runtime_events for insert to anon, authenticated with check (user_id is null or user_id = auth.uid());
drop policy if exists "runtime_events_select_own_or_admin" on public.app_runtime_events;
create policy "runtime_events_select_own_or_admin" on public.app_runtime_events for select to authenticated using (user_id = auth.uid() or public.is_admin());
drop policy if exists "push_tokens_select_own_or_admin" on public.push_notification_tokens;
create policy "push_tokens_select_own_or_admin" on public.push_notification_tokens for select to authenticated using (user_id = auth.uid() or public.is_admin());
drop policy if exists "push_tokens_insert_own" on public.push_notification_tokens;
create policy "push_tokens_insert_own" on public.push_notification_tokens for insert to authenticated with check (user_id = auth.uid());
drop policy if exists "push_tokens_update_own" on public.push_notification_tokens;
create policy "push_tokens_update_own" on public.push_notification_tokens for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "trust_reports_insert_own" on public.trust_safety_reports;
create policy "trust_reports_insert_own" on public.trust_safety_reports for insert to authenticated with check (reporter_id = auth.uid());
drop policy if exists "trust_reports_select_own_or_admin" on public.trust_safety_reports;
create policy "trust_reports_select_own_or_admin" on public.trust_safety_reports for select to authenticated using (reporter_id = auth.uid() or public.is_admin());
drop policy if exists "trust_reports_update_admin" on public.trust_safety_reports;
create policy "trust_reports_update_admin" on public.trust_safety_reports for update to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "cm_profiles_select_own" on campus_market.profiles;
create policy "cm_profiles_select_own" on campus_market.profiles for select to authenticated using (id = auth.uid());
drop policy if exists "cm_profiles_insert_own" on campus_market.profiles;
create policy "cm_profiles_insert_own" on campus_market.profiles for insert to authenticated with check (id = auth.uid());
drop policy if exists "cm_profiles_update_own" on campus_market.profiles;
create policy "cm_profiles_update_own" on campus_market.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists "cm_vendors_public_select_active" on campus_market.vendors;
create policy "cm_vendors_public_select_active" on campus_market.vendors for select using (is_active = true or owner_id = auth.uid());
drop policy if exists "cm_vendors_insert_owner" on campus_market.vendors;
create policy "cm_vendors_insert_owner" on campus_market.vendors for insert to authenticated with check (owner_id = auth.uid());
drop policy if exists "cm_vendors_update_owner" on campus_market.vendors;
create policy "cm_vendors_update_owner" on campus_market.vendors for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());

drop policy if exists "cm_items_public_select_active" on campus_market.catalog_items;
create policy "cm_items_public_select_active" on campus_market.catalog_items for select using (is_active = true and exists (select 1 from campus_market.vendors v where v.id = catalog_items.vendor_id and v.is_active = true));
drop policy if exists "cm_items_owner_manage" on campus_market.catalog_items;
create policy "cm_items_owner_manage" on campus_market.catalog_items for all to authenticated using (exists (select 1 from campus_market.vendors v where v.id = catalog_items.vendor_id and v.owner_id = auth.uid())) with check (exists (select 1 from campus_market.vendors v where v.id = catalog_items.vendor_id and v.owner_id = auth.uid()));

drop policy if exists "cm_orders_insert_customer" on campus_market.orders;
create policy "cm_orders_insert_customer" on campus_market.orders for insert to authenticated with check (customer_id = auth.uid());
drop policy if exists "cm_orders_select_participants" on campus_market.orders;
create policy "cm_orders_select_participants" on campus_market.orders for select to authenticated using (customer_id = auth.uid() or exists (select 1 from campus_market.vendors v where v.id = orders.vendor_id and v.owner_id = auth.uid()) or exists (select 1 from campus_market.deliveries d where d.order_id = orders.id and d.driver_id = auth.uid()));
drop policy if exists "cm_orders_update_vendor_or_driver" on campus_market.orders;
create policy "cm_orders_update_vendor_or_driver" on campus_market.orders for update to authenticated using (exists (select 1 from campus_market.vendors v where v.id = orders.vendor_id and v.owner_id = auth.uid()) or exists (select 1 from campus_market.deliveries d where d.order_id = orders.id and d.driver_id = auth.uid())) with check (true);

drop policy if exists "cm_order_items_select_participants" on campus_market.order_items;
create policy "cm_order_items_select_participants" on campus_market.order_items for select to authenticated using (exists (select 1 from campus_market.orders o left join campus_market.deliveries d on d.order_id = o.id left join campus_market.vendors v on v.id = o.vendor_id where o.id = order_items.order_id and (o.customer_id = auth.uid() or v.owner_id = auth.uid() or d.driver_id = auth.uid())));
drop policy if exists "cm_order_items_insert_customer" on campus_market.order_items;
create policy "cm_order_items_insert_customer" on campus_market.order_items for insert to authenticated with check (exists (select 1 from campus_market.orders o where o.id = order_items.order_id and o.customer_id = auth.uid()));

drop policy if exists "cm_deliveries_select_participants" on campus_market.deliveries;
create policy "cm_deliveries_select_participants" on campus_market.deliveries for select to authenticated using (driver_id = auth.uid() or exists (select 1 from campus_market.orders o left join campus_market.vendors v on v.id = o.vendor_id where o.id = deliveries.order_id and (o.customer_id = auth.uid() or v.owner_id = auth.uid())));
drop policy if exists "cm_deliveries_insert_vendor" on campus_market.deliveries;
create policy "cm_deliveries_insert_vendor" on campus_market.deliveries for insert to authenticated with check (exists (select 1 from campus_market.orders o join campus_market.vendors v on v.id = o.vendor_id where o.id = deliveries.order_id and v.owner_id = auth.uid()));
drop policy if exists "cm_deliveries_update_driver_or_vendor" on campus_market.deliveries;
create policy "cm_deliveries_update_driver_or_vendor" on campus_market.deliveries for update to authenticated using (driver_id = auth.uid() or exists (select 1 from campus_market.orders o join campus_market.vendors v on v.id = o.vendor_id where o.id = deliveries.order_id and v.owner_id = auth.uid())) with check (true);

drop policy if exists "cm_order_handoffs_select_participants" on campus_market.order_handoffs;
create policy "cm_order_handoffs_select_participants" on campus_market.order_handoffs for select to authenticated using (exists (select 1 from campus_market.orders o left join campus_market.deliveries d on d.order_id = o.id left join campus_market.vendors v on v.id = o.vendor_id where o.id = order_handoffs.order_id and (o.customer_id = auth.uid() or v.owner_id = auth.uid() or d.driver_id = auth.uid())));
drop policy if exists "cm_order_handoffs_update_driver_or_vendor" on campus_market.order_handoffs;
create policy "cm_order_handoffs_update_driver_or_vendor" on campus_market.order_handoffs for update to authenticated using (exists (select 1 from campus_market.orders o left join campus_market.deliveries d on d.order_id = o.id left join campus_market.vendors v on v.id = o.vendor_id where o.id = order_handoffs.order_id and (d.driver_id = auth.uid() or v.owner_id = auth.uid()))) with check (true);

drop policy if exists "cm_driver_locations_insert_self" on campus_market.driver_locations;
create policy "cm_driver_locations_insert_self" on campus_market.driver_locations for insert to authenticated with check (driver_id = auth.uid());
drop policy if exists "cm_driver_locations_select_participants" on campus_market.driver_locations;
create policy "cm_driver_locations_select_participants" on campus_market.driver_locations for select to authenticated using (driver_id = auth.uid() or exists (select 1 from campus_market.deliveries d join campus_market.orders o on o.id = d.order_id left join campus_market.vendors v on v.id = o.vendor_id where d.driver_id = driver_locations.driver_id and (o.customer_id = auth.uid() or v.owner_id = auth.uid())));
drop policy if exists "cm_trust_scores_read_all" on campus_market.trust_scores;
create policy "cm_trust_scores_read_all" on campus_market.trust_scores for select using (true);

do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'messages') then
    alter publication supabase_realtime add table public.messages;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'enquiries') then
    alter publication supabase_realtime add table public.enquiries;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'wallet_accounts') then
    alter publication supabase_realtime add table public.wallet_accounts;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'wallet_activities') then
    alter publication supabase_realtime add table public.wallet_activities;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'campus_market' and tablename = 'orders') then
    alter publication supabase_realtime add table campus_market.orders;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'campus_market' and tablename = 'deliveries') then
    alter publication supabase_realtime add table campus_market.deliveries;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'campus_market' and tablename = 'order_handoffs') then
    alter publication supabase_realtime add table campus_market.order_handoffs;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'campus_market' and tablename = 'driver_locations') then
    alter publication supabase_realtime add table campus_market.driver_locations;
  end if;
end $$;
