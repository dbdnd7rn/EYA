-- Pricing content tables for public website pages.
-- Safe to run multiple times.

create extension if not exists pgcrypto;

create table if not exists public.pricing_plans (
  id uuid primary key default gen_random_uuid(),
  tier text not null unique check (tier in ('Starter', 'Growth', 'Pro')),
  audiences text[] not null default '{}',
  monthly_label text not null,
  description text not null,
  features text[] not null default '{}',
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
create unique index if not exists ux_pricing_testimonials_sort_order on public.pricing_testimonials(sort_order);

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
create unique index if not exists ux_pricing_case_studies_sort_order on public.pricing_case_studies(sort_order);

create table if not exists public.pricing_faqs (
  id uuid primary key default gen_random_uuid(),
  question text not null,
  answer text not null,
  sort_order integer not null default 100,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists ux_pricing_faqs_sort_order on public.pricing_faqs(sort_order);

create or replace function public.set_updated_at_column()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_pricing_plans_updated_at on public.pricing_plans;
create trigger trg_pricing_plans_updated_at
before update on public.pricing_plans
for each row execute function public.set_updated_at_column();

drop trigger if exists trg_pricing_testimonials_updated_at on public.pricing_testimonials;
create trigger trg_pricing_testimonials_updated_at
before update on public.pricing_testimonials
for each row execute function public.set_updated_at_column();

drop trigger if exists trg_pricing_case_studies_updated_at on public.pricing_case_studies;
create trigger trg_pricing_case_studies_updated_at
before update on public.pricing_case_studies
for each row execute function public.set_updated_at_column();

drop trigger if exists trg_pricing_faqs_updated_at on public.pricing_faqs;
create trigger trg_pricing_faqs_updated_at
before update on public.pricing_faqs
for each row execute function public.set_updated_at_column();

alter table public.pricing_plans enable row level security;
alter table public.pricing_testimonials enable row level security;
alter table public.pricing_case_studies enable row level security;
alter table public.pricing_faqs enable row level security;

drop policy if exists "pricing_plans_read_all" on public.pricing_plans;
create policy "pricing_plans_read_all"
on public.pricing_plans
for select
to anon, authenticated
using (is_active = true);

drop policy if exists "pricing_testimonials_read_all" on public.pricing_testimonials;
create policy "pricing_testimonials_read_all"
on public.pricing_testimonials
for select
to anon, authenticated
using (is_active = true);

drop policy if exists "pricing_case_studies_read_all" on public.pricing_case_studies;
create policy "pricing_case_studies_read_all"
on public.pricing_case_studies
for select
to anon, authenticated
using (is_active = true);

drop policy if exists "pricing_faqs_read_all" on public.pricing_faqs;
create policy "pricing_faqs_read_all"
on public.pricing_faqs
for select
to anon, authenticated
using (is_active = true);

drop policy if exists "pricing_plans_admin_write" on public.pricing_plans;
create policy "pricing_plans_admin_write"
on public.pricing_plans
for all
to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
  )
)
with check (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
  )
);

drop policy if exists "pricing_testimonials_admin_write" on public.pricing_testimonials;
create policy "pricing_testimonials_admin_write"
on public.pricing_testimonials
for all
to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
  )
)
with check (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
  )
);

drop policy if exists "pricing_case_studies_admin_write" on public.pricing_case_studies;
create policy "pricing_case_studies_admin_write"
on public.pricing_case_studies
for all
to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
  )
)
with check (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
  )
);

drop policy if exists "pricing_faqs_admin_write" on public.pricing_faqs;
create policy "pricing_faqs_admin_write"
on public.pricing_faqs
for all
to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
  )
)
with check (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
  )
);

grant select on public.pricing_plans to anon, authenticated;
grant select on public.pricing_testimonials to anon, authenticated;
grant select on public.pricing_case_studies to anon, authenticated;
grant select on public.pricing_faqs to anon, authenticated;
grant all on public.pricing_plans, public.pricing_testimonials, public.pricing_case_studies, public.pricing_faqs to service_role;

insert into public.pricing_plans (tier, audiences, monthly_label, description, features, cta, route, goal_weights, sort_order, is_active)
values
  (
    'Starter',
    array['student','vendor'],
    'Free while rollout continues',
    'Best for exploring listings, testing demand, and getting started with core tools.',
    array['Browse and save listings','Basic enquiry tools','Simple profile visibility'],
    'Start free',
    '/(auth)/signup',
    '{"budget":2}'::jsonb,
    1,
    true
  ),
  (
    'Growth',
    array['landlord','vendor','restaurant'],
    'Best value for active sellers',
    'Built for regular landlords and sellers who need stronger visibility and conversion.',
    array['Priority listing placement','Performance insights','Promotional campaign slots'],
    'Choose Growth',
    '/(auth)/signup',
    '{"growth":2,"trust":1}'::jsonb,
    2,
    true
  ),
  (
    'Pro',
    array['landlord','restaurant'],
    'For high-volume businesses',
    'For teams managing multiple units, inventory flows, and delivery-heavy operations.',
    array['Advanced analytics','Delivery optimization support','Dedicated success contact'],
    'Talk to sales',
    '/contact',
    '{"growth":2,"delivery":2,"trust":1}'::jsonb,
    3,
    true
  )
on conflict (tier) do update
set
  audiences = excluded.audiences,
  monthly_label = excluded.monthly_label,
  description = excluded.description,
  features = excluded.features,
  cta = excluded.cta,
  route = excluded.route,
  goal_weights = excluded.goal_weights,
  sort_order = excluded.sort_order,
  is_active = excluded.is_active;

insert into public.pricing_testimonials (quote, byline, sort_order, is_active)
values
  ('We doubled weekly room enquiries after switching to a stronger profile and promoted listings.', 'Mwai, Landlord - Blantyre', 1, true),
  ('Students discovered our restaurant faster once delivery options and trust badges were visible.', 'Tadala, Restaurant Owner', 2, true),
  ('The listing tools helped us reach more hostels near campus in less than two weeks.', 'Ruth, Campus Vendor', 3, true)
on conflict (sort_order) do update
set
  quote = excluded.quote,
  byline = excluded.byline,
  is_active = excluded.is_active;

insert into public.pricing_case_studies (title, metric, detail, sort_order, is_active)
values
  ('Landlord portfolio growth', '+47%', 'More qualified enquiries in 30 days', 1, true),
  ('Restaurant checkout lift', '+32%', 'Higher order completion after delivery clarity', 2, true),
  ('Vendor discovery reach', '2.1x', 'Increase in listing views near campus zones', 3, true)
on conflict (sort_order) do update
set
  title = excluded.title,
  metric = excluded.metric,
  detail = excluded.detail,
  is_active = excluded.is_active;

insert into public.pricing_faqs (question, answer, sort_order, is_active)
values
  ('Do students pay to browse rooms and marketplace products?', 'No, browsing is currently free for students as feature rollout continues.', 1, true),
  ('Is delivery included in every plan?', 'Delivery is optional and charged per order based on distance and pickup/drop-off points.', 2, true),
  ('Can I change plans later?', 'Yes. You can upgrade when you need stronger visibility, analytics, or support.', 3, true)
on conflict (sort_order) do update
set
  question = excluded.question,
  answer = excluded.answer,
  is_active = excluded.is_active;
