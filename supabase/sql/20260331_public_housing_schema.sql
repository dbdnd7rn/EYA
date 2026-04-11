create extension if not exists pgcrypto;

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
  updated_at timestamptz not null default now()
);

alter table public.profiles
  add column if not exists full_name text,
  add column if not exists first_name text,
  add column if not exists last_name text,
  add column if not exists surname text,
  add column if not exists email text,
  add column if not exists phone text,
  add column if not exists avatar_url text,
  add column if not exists role text not null default 'student',
  add column if not exists onboarded boolean not null default false,
  add column if not exists campus text,
  add column if not exists area text,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'profiles_role_check'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles drop constraint profiles_role_check;
  end if;

  alter table public.profiles
    add constraint profiles_role_check
    check (role in ('student', 'landlord', 'agent', 'admin'));
end $$;

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

create index if not exists idx_listings_landlord_id on public.listings(landlord_id);
create index if not exists idx_listings_active on public.listings(is_active);
create index if not exists idx_listings_area_city on public.listings(area, city);
create index if not exists idx_listings_campus on public.listings(campus);
create index if not exists idx_listings_created_at on public.listings(created_at desc);

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

create index if not exists idx_enquiries_student_id on public.enquiries(student_id);
create index if not exists idx_enquiries_landlord_id on public.enquiries(landlord_id);
create index if not exists idx_enquiries_listing_id on public.enquiries(listing_id);
create index if not exists idx_enquiries_created_at on public.enquiries(created_at desc);

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

create index if not exists idx_messages_enquiry_id on public.messages(enquiry_id, created_at asc);

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

create index if not exists idx_reviews_listing_id on public.reviews(listing_id);

create table if not exists public.saved_rooms (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references auth.users(id) on delete cascade,
  listing_id uuid not null references public.listings(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (student_id, listing_id)
);

create index if not exists idx_saved_rooms_student_id on public.saved_rooms(student_id);

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

create index if not exists idx_listing_reports_listing_id on public.listing_reports(listing_id);
create index if not exists idx_listing_reports_reporter_id on public.listing_reports(reporter_id);

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

create index if not exists idx_landlord_verifications_landlord_id on public.landlord_verifications(landlord_id, requested_at desc);

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

create index if not exists idx_support_tickets_user_id on public.support_tickets(user_id);
create index if not exists idx_support_tickets_status on public.support_tickets(status);

create or replace function public.set_updated_at_column()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_profiles_updated_at on public.profiles;
create trigger trg_profiles_updated_at
before update on public.profiles
for each row execute function public.set_updated_at_column();

drop trigger if exists trg_listings_updated_at on public.listings;
create trigger trg_listings_updated_at
before update on public.listings
for each row execute function public.set_updated_at_column();

drop trigger if exists trg_enquiries_updated_at on public.enquiries;
create trigger trg_enquiries_updated_at
before update on public.enquiries
for each row execute function public.set_updated_at_column();

drop trigger if exists trg_reviews_updated_at on public.reviews;
create trigger trg_reviews_updated_at
before update on public.reviews
for each row execute function public.set_updated_at_column();

drop trigger if exists trg_listing_reports_updated_at on public.listing_reports;
create trigger trg_listing_reports_updated_at
before update on public.listing_reports
for each row execute function public.set_updated_at_column();

drop trigger if exists trg_landlord_verifications_updated_at on public.landlord_verifications;
create trigger trg_landlord_verifications_updated_at
before update on public.landlord_verifications
for each row execute function public.set_updated_at_column();

drop trigger if exists trg_support_tickets_updated_at on public.support_tickets;
create trigger trg_support_tickets_updated_at
before update on public.support_tickets
for each row execute function public.set_updated_at_column();

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

alter table public.profiles enable row level security;
alter table public.listings enable row level security;
alter table public.enquiries enable row level security;
alter table public.messages enable row level security;
alter table public.reviews enable row level security;
alter table public.saved_rooms enable row level security;
alter table public.listing_reports enable row level security;
alter table public.landlord_verifications enable row level security;
alter table public.support_tickets enable row level security;

drop policy if exists "profiles_select_own_or_admin" on public.profiles;
create policy "profiles_select_own_or_admin" on public.profiles
for select to authenticated
using (id = auth.uid() or public.is_admin());

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own" on public.profiles
for insert to authenticated
with check (id = auth.uid());

drop policy if exists "profiles_update_own_or_admin" on public.profiles;
create policy "profiles_update_own_or_admin" on public.profiles
for update to authenticated
using (id = auth.uid() or public.is_admin())
with check (id = auth.uid() or public.is_admin());

drop policy if exists "listings_public_read_active" on public.listings;
create policy "listings_public_read_active" on public.listings
for select
using (is_active = true or landlord_id = auth.uid() or public.is_admin());

drop policy if exists "listings_landlord_insert" on public.listings;
create policy "listings_landlord_insert" on public.listings
for insert to authenticated
with check (landlord_id = auth.uid());

drop policy if exists "listings_landlord_update" on public.listings;
create policy "listings_landlord_update" on public.listings
for update to authenticated
using (landlord_id = auth.uid() or public.is_admin())
with check (landlord_id = auth.uid() or public.is_admin());

drop policy if exists "listings_landlord_delete" on public.listings;
create policy "listings_landlord_delete" on public.listings
for delete to authenticated
using (landlord_id = auth.uid() or public.is_admin());

drop policy if exists "enquiries_participant_read" on public.enquiries;
create policy "enquiries_participant_read" on public.enquiries
for select to authenticated
using (student_id = auth.uid() or landlord_id = auth.uid() or public.is_admin());

drop policy if exists "enquiries_student_insert" on public.enquiries;
create policy "enquiries_student_insert" on public.enquiries
for insert to authenticated
with check (student_id = auth.uid());

drop policy if exists "enquiries_participant_update" on public.enquiries;
create policy "enquiries_participant_update" on public.enquiries
for update to authenticated
using (student_id = auth.uid() or landlord_id = auth.uid() or public.is_admin())
with check (student_id = auth.uid() or landlord_id = auth.uid() or public.is_admin());

drop policy if exists "messages_participant_read" on public.messages;
create policy "messages_participant_read" on public.messages
for select to authenticated
using (
  exists (
    select 1
    from public.enquiries e
    where e.id = messages.enquiry_id
      and (e.student_id = auth.uid() or e.landlord_id = auth.uid() or public.is_admin())
  )
);

drop policy if exists "messages_participant_insert" on public.messages;
create policy "messages_participant_insert" on public.messages
for insert to authenticated
with check (
  sender_id = auth.uid()
  and exists (
    select 1
    from public.enquiries e
    where e.id = messages.enquiry_id
      and (e.student_id = auth.uid() or e.landlord_id = auth.uid() or public.is_admin())
  )
);

drop policy if exists "reviews_public_read" on public.reviews;
create policy "reviews_public_read" on public.reviews
for select
using (true);

drop policy if exists "reviews_student_write" on public.reviews;
create policy "reviews_student_write" on public.reviews
for all to authenticated
using (student_id = auth.uid() or public.is_admin())
with check (student_id = auth.uid() or public.is_admin());

drop policy if exists "saved_rooms_select_own" on public.saved_rooms;
create policy "saved_rooms_select_own" on public.saved_rooms
for select to authenticated
using (student_id = auth.uid() or public.is_admin());

drop policy if exists "saved_rooms_insert_own" on public.saved_rooms;
create policy "saved_rooms_insert_own" on public.saved_rooms
for insert to authenticated
with check (student_id = auth.uid());

drop policy if exists "saved_rooms_delete_own" on public.saved_rooms;
create policy "saved_rooms_delete_own" on public.saved_rooms
for delete to authenticated
using (student_id = auth.uid() or public.is_admin());

drop policy if exists "listing_reports_insert_own" on public.listing_reports;
create policy "listing_reports_insert_own" on public.listing_reports
for insert to authenticated
with check (reporter_id = auth.uid());

drop policy if exists "listing_reports_select_own_or_admin" on public.listing_reports;
create policy "listing_reports_select_own_or_admin" on public.listing_reports
for select to authenticated
using (reporter_id = auth.uid() or public.is_admin());

drop policy if exists "listing_reports_update_admin" on public.listing_reports;
create policy "listing_reports_update_admin" on public.listing_reports
for update to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "landlord_verifications_select_own_or_admin" on public.landlord_verifications;
create policy "landlord_verifications_select_own_or_admin" on public.landlord_verifications
for select to authenticated
using (landlord_id = auth.uid() or public.is_admin());

drop policy if exists "landlord_verifications_insert_own" on public.landlord_verifications;
create policy "landlord_verifications_insert_own" on public.landlord_verifications
for insert to authenticated
with check (landlord_id = auth.uid() or public.is_admin());

drop policy if exists "landlord_verifications_update_admin" on public.landlord_verifications;
create policy "landlord_verifications_update_admin" on public.landlord_verifications
for update to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "support_tickets_select_own_or_admin" on public.support_tickets;
create policy "support_tickets_select_own_or_admin" on public.support_tickets
for select to authenticated
using (user_id = auth.uid() or public.is_admin());

drop policy if exists "support_tickets_insert_own" on public.support_tickets;
create policy "support_tickets_insert_own" on public.support_tickets
for insert to authenticated
with check (user_id = auth.uid());

drop policy if exists "support_tickets_update_admin" on public.support_tickets;
create policy "support_tickets_update_admin" on public.support_tickets
for update to authenticated
using (public.is_admin())
with check (public.is_admin());

grant select on public.landlord_public_verification to anon, authenticated;
grant select on public.listings, public.reviews, public.landlord_public_verification to anon;
grant select, insert, update, delete on public.profiles to authenticated;
grant select, insert, update, delete on public.listings to authenticated;
grant select, insert, update on public.enquiries to authenticated;
grant select, insert on public.messages to authenticated;
grant select, insert, update, delete on public.reviews to authenticated;
grant select, insert, delete on public.saved_rooms to authenticated;
grant select, insert on public.listing_reports to authenticated;
grant select, insert on public.landlord_verifications to authenticated;
grant select, insert on public.support_tickets to authenticated;
grant all on public.profiles, public.listings, public.enquiries, public.messages, public.reviews, public.saved_rooms, public.listing_reports, public.landlord_verifications, public.support_tickets to service_role;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'messages'
  ) then
    alter publication supabase_realtime add table public.messages;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'enquiries'
  ) then
    alter publication supabase_realtime add table public.enquiries;
  end if;
end $$;
