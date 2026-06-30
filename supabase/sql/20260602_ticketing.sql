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

create table if not exists public.ticket_events (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  category text not null default 'Music',
  description text,
  date_label text not null,
  starts_at timestamptz,
  ends_at timestamptz,
  venue text not null,
  city text not null,
  image_url text not null,
  hero_image_url text not null,
  status text not null default 'draft' check (status in ('draft', 'published', 'cancelled', 'archived')),
  organizer_id uuid references auth.users(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  sort_order integer not null default 100,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ticket_tiers (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.ticket_events(id) on delete cascade,
  name text not null,
  description text not null default '',
  price_mwk numeric(12,2) not null check (price_mwk >= 0),
  capacity_total integer not null check (capacity_total >= 0),
  capacity_sold integer not null default 0 check (capacity_sold >= 0),
  capacity_reserved integer not null default 0 check (capacity_reserved >= 0),
  available boolean not null default true,
  sale_starts_at timestamptz,
  sale_ends_at timestamptz,
  sort_order integer not null default 100,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ticket_tiers_capacity_valid check (capacity_sold + capacity_reserved <= capacity_total)
);

create table if not exists public.ticket_orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  event_id uuid not null references public.ticket_events(id) on delete restrict,
  tier_id uuid not null references public.ticket_tiers(id) on delete restrict,
  quantity integer not null check (quantity > 0 and quantity <= 10),
  unit_price_mwk numeric(12,2) not null check (unit_price_mwk >= 0),
  service_fee_mwk numeric(12,2) not null default 0 check (service_fee_mwk >= 0),
  total_mwk numeric(12,2) not null check (total_mwk >= 0),
  status text not null default 'pending' check (status in ('pending', 'awaiting_payment', 'paid', 'failed', 'cancelled', 'expired', 'refunded', 'payment_review')),
  payment_status text not null default 'unpaid' check (payment_status in ('unpaid', 'pending', 'paid', 'failed', 'cancelled', 'expired', 'refunded')),
  payment_id uuid references public.payments(id) on delete set null,
  payment_reference text,
  customer_email text,
  customer_phone text,
  reserved_until timestamptz not null default (now() + interval '15 minutes'),
  paid_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ticket_order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.ticket_orders(id) on delete cascade,
  event_id uuid not null references public.ticket_events(id) on delete restrict,
  tier_id uuid not null references public.ticket_tiers(id) on delete restrict,
  event_title_snapshot text not null,
  tier_name_snapshot text not null,
  quantity integer not null check (quantity > 0),
  unit_price_mwk numeric(12,2) not null check (unit_price_mwk >= 0),
  line_total_mwk numeric(12,2) not null check (line_total_mwk >= 0),
  created_at timestamptz not null default now()
);

create table if not exists public.ticket_payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.ticket_orders(id) on delete cascade,
  payment_id uuid references public.payments(id) on delete set null,
  provider text not null default 'paychangu',
  method text,
  reference text not null,
  amount_mwk numeric(12,2) not null check (amount_mwk >= 0),
  status text not null default 'pending' check (status in ('pending', 'paid', 'failed', 'cancelled', 'refunded')),
  provider_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(order_id, reference)
);

create table if not exists public.issued_tickets (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.ticket_orders(id) on delete cascade,
  order_item_id uuid references public.ticket_order_items(id) on delete set null,
  event_id uuid not null references public.ticket_events(id) on delete restrict,
  tier_id uuid not null references public.ticket_tiers(id) on delete restrict,
  user_id uuid not null references auth.users(id) on delete cascade,
  ticket_code text not null unique,
  qr_token_hash text not null unique,
  status text not null default 'active' check (status in ('active', 'used', 'cancelled', 'refunded')),
  checked_in_at timestamptz,
  checked_in_by uuid references auth.users(id) on delete set null,
  issued_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ticket_checkins (
  id uuid primary key default gen_random_uuid(),
  issued_ticket_id uuid not null references public.issued_tickets(id) on delete cascade,
  event_id uuid not null references public.ticket_events(id) on delete cascade,
  checked_in_by uuid references auth.users(id) on delete set null,
  method text not null default 'qr' check (method in ('qr', 'manual')),
  device_label text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_ticket_events_status_starts on public.ticket_events(status, starts_at);
create index if not exists idx_ticket_tiers_event_id on public.ticket_tiers(event_id, sort_order);
create index if not exists idx_ticket_orders_user_id on public.ticket_orders(user_id, created_at desc);
create index if not exists idx_ticket_orders_status on public.ticket_orders(status, reserved_until);
create index if not exists idx_ticket_orders_payment_reference on public.ticket_orders(payment_reference);
create index if not exists idx_ticket_order_items_order_id on public.ticket_order_items(order_id);
create index if not exists idx_ticket_payments_order_id on public.ticket_payments(order_id);
create index if not exists idx_issued_tickets_user_id on public.issued_tickets(user_id, issued_at desc);
create index if not exists idx_issued_tickets_ticket_code on public.issued_tickets(ticket_code);
create index if not exists idx_ticket_checkins_event_id on public.ticket_checkins(event_id, created_at desc);

drop trigger if exists trg_ticket_events_updated_at on public.ticket_events;
create trigger trg_ticket_events_updated_at before update on public.ticket_events for each row execute function public.set_updated_at_column();

drop trigger if exists trg_ticket_tiers_updated_at on public.ticket_tiers;
create trigger trg_ticket_tiers_updated_at before update on public.ticket_tiers for each row execute function public.set_updated_at_column();

drop trigger if exists trg_ticket_orders_updated_at on public.ticket_orders;
create trigger trg_ticket_orders_updated_at before update on public.ticket_orders for each row execute function public.set_updated_at_column();

drop trigger if exists trg_ticket_payments_updated_at on public.ticket_payments;
create trigger trg_ticket_payments_updated_at before update on public.ticket_payments for each row execute function public.set_updated_at_column();

drop trigger if exists trg_issued_tickets_updated_at on public.issued_tickets;
create trigger trg_issued_tickets_updated_at before update on public.issued_tickets for each row execute function public.set_updated_at_column();

create or replace function public.release_expired_ticket_reservations()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer := 0;
begin
  with expired as (
    select id, tier_id, quantity
    from public.ticket_orders
    where status in ('pending', 'awaiting_payment')
      and payment_status in ('unpaid', 'pending')
      and reserved_until < now()
    for update
  ),
  tier_totals as (
    select tier_id, sum(quantity)::integer as quantity
    from expired
    group by tier_id
  ),
  released_tiers as (
    update public.ticket_tiers tt
    set capacity_reserved = greatest(0, tt.capacity_reserved - tier_totals.quantity),
        updated_at = now()
    from tier_totals
    where tt.id = tier_totals.tier_id
    returning tt.id
  ),
  expired_orders as (
    update public.ticket_orders o
    set status = 'expired',
        payment_status = 'expired',
        updated_at = now()
    where o.id in (select id from expired)
    returning o.id
  )
  select count(*) into v_count from expired_orders;

  return coalesce(v_count, 0);
end;
$$;

create or replace function public.reserve_ticket_order(
  p_user_id uuid,
  p_event_id uuid,
  p_tier_id uuid,
  p_quantity integer,
  p_customer_email text default null,
  p_customer_phone text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event public.ticket_events%rowtype;
  v_tier public.ticket_tiers%rowtype;
  v_order public.ticket_orders%rowtype;
  v_item public.ticket_order_items%rowtype;
  v_available integer;
  v_service_fee numeric(12,2) := 0;
begin
  perform public.release_expired_ticket_reservations();

  if p_user_id is null then
    raise exception 'A user id is required.';
  end if;

  if p_quantity is null or p_quantity < 1 or p_quantity > 10 then
    raise exception 'Ticket quantity must be between 1 and 10.';
  end if;

  select * into v_event
  from public.ticket_events
  where id = p_event_id
  for update;

  if not found or v_event.status <> 'published' then
    raise exception 'This event is not available for booking.';
  end if;

  select * into v_tier
  from public.ticket_tiers
  where id = p_tier_id and event_id = p_event_id
  for update;

  if not found or v_tier.available = false then
    raise exception 'This ticket tier is not available.';
  end if;

  if v_tier.sale_starts_at is not null and v_tier.sale_starts_at > now() then
    raise exception 'Ticket sales have not started yet.';
  end if;

  if v_tier.sale_ends_at is not null and v_tier.sale_ends_at < now() then
    raise exception 'Ticket sales have ended.';
  end if;

  v_available := v_tier.capacity_total - v_tier.capacity_sold - v_tier.capacity_reserved;
  if v_available < p_quantity then
    raise exception 'Only % tickets are available for this tier.', greatest(v_available, 0);
  end if;

  update public.ticket_tiers
  set capacity_reserved = capacity_reserved + p_quantity,
      updated_at = now()
  where id = v_tier.id;

  insert into public.ticket_orders (
    user_id,
    event_id,
    tier_id,
    quantity,
    unit_price_mwk,
    service_fee_mwk,
    total_mwk,
    status,
    payment_status,
    customer_email,
    customer_phone,
    reserved_until
  )
  values (
    p_user_id,
    v_event.id,
    v_tier.id,
    p_quantity,
    v_tier.price_mwk,
    v_service_fee,
    (v_tier.price_mwk * p_quantity) + v_service_fee,
    'pending',
    'unpaid',
    nullif(p_customer_email, ''),
    nullif(p_customer_phone, ''),
    now() + interval '15 minutes'
  )
  returning * into v_order;

  insert into public.ticket_order_items (
    order_id,
    event_id,
    tier_id,
    event_title_snapshot,
    tier_name_snapshot,
    quantity,
    unit_price_mwk,
    line_total_mwk
  )
  values (
    v_order.id,
    v_event.id,
    v_tier.id,
    v_event.title,
    v_tier.name,
    p_quantity,
    v_tier.price_mwk,
    v_tier.price_mwk * p_quantity
  )
  returning * into v_item;

  return jsonb_build_object(
    'order', to_jsonb(v_order),
    'item', to_jsonb(v_item),
    'event', to_jsonb(v_event),
    'tier', to_jsonb(v_tier),
    'available_after_reservation', v_available - p_quantity
  );
end;
$$;

create or replace function public.release_ticket_order(
  p_order_id uuid,
  p_status text default 'cancelled'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.ticket_orders%rowtype;
begin
  select * into v_order
  from public.ticket_orders
  where id = p_order_id
  for update;

  if not found then
    raise exception 'Ticket order not found.';
  end if;

  if v_order.status in ('paid', 'refunded') then
    return jsonb_build_object('order', to_jsonb(v_order), 'released', false);
  end if;

  update public.ticket_tiers
  set capacity_reserved = greatest(0, capacity_reserved - v_order.quantity),
      updated_at = now()
  where id = v_order.tier_id;

  update public.ticket_orders
  set status = case when p_status in ('failed', 'cancelled', 'expired') then p_status else 'cancelled' end,
      payment_status = case when p_status = 'failed' then 'failed' when p_status = 'expired' then 'expired' else 'cancelled' end,
      updated_at = now()
  where id = v_order.id
  returning * into v_order;

  return jsonb_build_object('order', to_jsonb(v_order), 'released', true);
end;
$$;

create or replace function public.issue_ticket_order(
  p_order_id uuid,
  p_payment_id uuid,
  p_payment_reference text,
  p_paid_at timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.ticket_orders%rowtype;
  v_tier public.ticket_tiers%rowtype;
  v_item public.ticket_order_items%rowtype;
  v_has_active_reservation boolean;
  v_available integer;
  v_index integer;
  v_ticket_code text;
  v_qr_token text;
  v_tickets jsonb;
begin
  select * into v_order
  from public.ticket_orders
  where id = p_order_id
  for update;

  if not found then
    raise exception 'Ticket order not found.';
  end if;

  select * into v_tier
  from public.ticket_tiers
  where id = v_order.tier_id
  for update;

  if not found then
    raise exception 'Ticket tier not found.';
  end if;

  select * into v_item
  from public.ticket_order_items
  where order_id = v_order.id
  order by created_at asc
  limit 1;

  if v_order.status = 'paid' then
    select coalesce(jsonb_agg(to_jsonb(t) order by t.issued_at asc), '[]'::jsonb)
    into v_tickets
    from public.issued_tickets t
    where t.order_id = v_order.id;

    return jsonb_build_object('order', to_jsonb(v_order), 'tickets', coalesce(v_tickets, '[]'::jsonb), 'finalized', true);
  end if;

  v_has_active_reservation := v_order.status in ('pending', 'awaiting_payment') and v_order.reserved_until >= now();
  if not v_has_active_reservation then
    v_available := v_tier.capacity_total - v_tier.capacity_sold - v_tier.capacity_reserved;
    if v_available < v_order.quantity then
      update public.ticket_orders
      set status = 'payment_review',
          payment_status = 'paid',
          payment_id = p_payment_id,
          payment_reference = p_payment_reference,
          paid_at = coalesce(p_paid_at, now()),
          updated_at = now()
      where id = v_order.id
      returning * into v_order;

      return jsonb_build_object(
        'order', to_jsonb(v_order),
        'tickets', '[]'::jsonb,
        'finalized', false,
        'message', 'Payment is paid but ticket stock needs admin review.'
      );
    end if;
  end if;

  update public.ticket_tiers
  set capacity_reserved = greatest(0, capacity_reserved - case when v_has_active_reservation then v_order.quantity else 0 end),
      capacity_sold = capacity_sold + v_order.quantity,
      updated_at = now()
  where id = v_tier.id;

  update public.ticket_orders
  set status = 'paid',
      payment_status = 'paid',
      payment_id = p_payment_id,
      payment_reference = p_payment_reference,
      paid_at = coalesce(p_paid_at, now()),
      updated_at = now()
  where id = v_order.id
  returning * into v_order;

  insert into public.ticket_payments (
    order_id,
    payment_id,
    provider,
    method,
    reference,
    amount_mwk,
    status
  )
  values (
    v_order.id,
    p_payment_id,
    'paychangu',
    null,
    coalesce(nullif(p_payment_reference, ''), v_order.payment_reference, v_order.id::text),
    v_order.total_mwk,
    'paid'
  )
  on conflict (order_id, reference)
  do update set
    payment_id = excluded.payment_id,
    amount_mwk = excluded.amount_mwk,
    status = 'paid',
    updated_at = now();

  if not exists (select 1 from public.issued_tickets where order_id = v_order.id) then
    for v_index in 1..v_order.quantity loop
      v_ticket_code := 'EYA-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12));
      v_qr_token := v_order.id::text || ':' || v_ticket_code || ':' || encode(gen_random_bytes(16), 'hex');

      insert into public.issued_tickets (
        order_id,
        order_item_id,
        event_id,
        tier_id,
        user_id,
        ticket_code,
        qr_token_hash,
        metadata
      )
      values (
        v_order.id,
        v_item.id,
        v_order.event_id,
        v_order.tier_id,
        v_order.user_id,
        v_ticket_code,
        encode(digest(v_qr_token, 'sha256'), 'hex'),
        jsonb_build_object('ticket_index', v_index)
      );
    end loop;
  end if;

  select coalesce(jsonb_agg(to_jsonb(t) order by t.issued_at asc), '[]'::jsonb)
  into v_tickets
  from public.issued_tickets t
  where t.order_id = v_order.id;

  return jsonb_build_object('order', to_jsonb(v_order), 'tickets', coalesce(v_tickets, '[]'::jsonb), 'finalized', true);
end;
$$;

grant select on public.ticket_events, public.ticket_tiers to anon, authenticated;
grant select, insert, update on public.ticket_orders, public.ticket_order_items, public.ticket_payments, public.issued_tickets, public.ticket_checkins to authenticated;
grant all on public.ticket_events, public.ticket_tiers, public.ticket_orders, public.ticket_order_items, public.ticket_payments, public.issued_tickets, public.ticket_checkins to service_role;
grant execute on function public.release_expired_ticket_reservations() to authenticated, service_role;
grant execute on function public.reserve_ticket_order(uuid, uuid, uuid, integer, text, text) to authenticated, service_role;
grant execute on function public.release_ticket_order(uuid, text) to authenticated, service_role;
grant execute on function public.issue_ticket_order(uuid, uuid, text, timestamptz) to authenticated, service_role;

alter table public.ticket_events enable row level security;
alter table public.ticket_tiers enable row level security;
alter table public.ticket_orders enable row level security;
alter table public.ticket_order_items enable row level security;
alter table public.ticket_payments enable row level security;
alter table public.issued_tickets enable row level security;
alter table public.ticket_checkins enable row level security;

drop policy if exists "ticket_events_read_published_or_admin" on public.ticket_events;
create policy "ticket_events_read_published_or_admin" on public.ticket_events
for select to anon, authenticated
using (status = 'published' or public.is_admin());

drop policy if exists "ticket_events_admin_write" on public.ticket_events;
create policy "ticket_events_admin_write" on public.ticket_events
for all to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "ticket_tiers_read_published_or_admin" on public.ticket_tiers;
create policy "ticket_tiers_read_published_or_admin" on public.ticket_tiers
for select to anon, authenticated
using (
  public.is_admin()
  or exists (
    select 1 from public.ticket_events e
    where e.id = ticket_tiers.event_id and e.status = 'published'
  )
);

drop policy if exists "ticket_tiers_admin_write" on public.ticket_tiers;
create policy "ticket_tiers_admin_write" on public.ticket_tiers
for all to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "ticket_orders_select_own_or_admin" on public.ticket_orders;
create policy "ticket_orders_select_own_or_admin" on public.ticket_orders
for select to authenticated
using (user_id = auth.uid() or public.is_admin());

drop policy if exists "ticket_orders_insert_own_or_admin" on public.ticket_orders;
create policy "ticket_orders_insert_own_or_admin" on public.ticket_orders
for insert to authenticated
with check (user_id = auth.uid() or public.is_admin());

drop policy if exists "ticket_orders_update_admin" on public.ticket_orders;
create policy "ticket_orders_update_admin" on public.ticket_orders
for update to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "ticket_order_items_select_own_or_admin" on public.ticket_order_items;
create policy "ticket_order_items_select_own_or_admin" on public.ticket_order_items
for select to authenticated
using (
  exists (
    select 1 from public.ticket_orders o
    where o.id = ticket_order_items.order_id
      and (o.user_id = auth.uid() or public.is_admin())
  )
);

drop policy if exists "ticket_order_items_insert_own_or_admin" on public.ticket_order_items;
create policy "ticket_order_items_insert_own_or_admin" on public.ticket_order_items
for insert to authenticated
with check (
  exists (
    select 1 from public.ticket_orders o
    where o.id = ticket_order_items.order_id
      and (o.user_id = auth.uid() or public.is_admin())
  )
);

drop policy if exists "ticket_payments_select_own_or_admin" on public.ticket_payments;
create policy "ticket_payments_select_own_or_admin" on public.ticket_payments
for select to authenticated
using (
  exists (
    select 1 from public.ticket_orders o
    where o.id = ticket_payments.order_id
      and (o.user_id = auth.uid() or public.is_admin())
  )
);

drop policy if exists "ticket_payments_insert_admin" on public.ticket_payments;
create policy "ticket_payments_insert_admin" on public.ticket_payments
for insert to authenticated
with check (public.is_admin());

drop policy if exists "ticket_payments_update_admin" on public.ticket_payments;
create policy "ticket_payments_update_admin" on public.ticket_payments
for update to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "issued_tickets_select_own_or_admin" on public.issued_tickets;
create policy "issued_tickets_select_own_or_admin" on public.issued_tickets
for select to authenticated
using (user_id = auth.uid() or public.is_admin());

drop policy if exists "issued_tickets_update_admin" on public.issued_tickets;
create policy "issued_tickets_update_admin" on public.issued_tickets
for update to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "ticket_checkins_select_admin" on public.ticket_checkins;
create policy "ticket_checkins_select_admin" on public.ticket_checkins
for select to authenticated
using (public.is_admin());

drop policy if exists "ticket_checkins_insert_admin" on public.ticket_checkins;
create policy "ticket_checkins_insert_admin" on public.ticket_checkins
for insert to authenticated
with check (public.is_admin());

insert into public.ticket_events (
  title,
  category,
  description,
  date_label,
  starts_at,
  ends_at,
  venue,
  city,
  image_url,
  hero_image_url,
  status,
  sort_order
)
select seed.title, seed.category, seed.description, seed.date_label, seed.starts_at, seed.ends_at, seed.venue, seed.city, seed.image_url, seed.hero_image_url, seed.status, seed.sort_order
from (
  values
  (
    'Melodies & Mimosas',
    'Festival',
    'A music and lifestyle festival experience.',
    '25 May - 6 Sept 2026',
    '2026-05-25 15:00:00+02'::timestamptz,
    '2026-09-06 23:00:00+02'::timestamptz,
    'Stakeout',
    'Blantyre',
    'https://images.unsplash.com/photo-1501281668745-f7f57925c3b4?auto=format&fit=crop&w=900&q=80',
    'https://images.unsplash.com/photo-1533174072545-7a4b6ad7a6c3?auto=format&fit=crop&w=1400&q=80',
    'published',
    10
  ),
  (
    'Lulu @ 25 The Legacy Concert',
    'Music',
    'A live concert celebrating a legacy of Malawian music.',
    '29 May - 31 Aug 2026',
    '2026-05-29 18:00:00+02'::timestamptz,
    '2026-08-31 23:00:00+02'::timestamptz,
    'BICC',
    'Lilongwe',
    'https://images.unsplash.com/photo-1506157786151-b8491531f063?auto=format&fit=crop&w=900&q=80',
    'https://images.unsplash.com/photo-1492684223066-81342ee5ff30?auto=format&fit=crop&w=1400&q=80',
    'published',
    20
  ),
  (
    'Landlord Pakwao Concert',
    'Music',
    'A high-energy live concert in Lilongwe.',
    '1 Aug - 2 Aug 2026',
    '2026-08-01 18:00:00+02'::timestamptz,
    '2026-08-02 23:00:00+02'::timestamptz,
    'Gateway Mall',
    'Lilongwe',
    'https://images.unsplash.com/photo-1524368535928-5b5e00ddc76b?auto=format&fit=crop&w=900&q=80',
    'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?auto=format&fit=crop&w=1400&q=80',
    'published',
    30
  )
) as seed(title, category, description, date_label, starts_at, ends_at, venue, city, image_url, hero_image_url, status, sort_order)
where not exists (
  select 1 from public.ticket_events existing
  where existing.title = seed.title
);

insert into public.ticket_tiers (event_id, name, description, price_mwk, capacity_total, available, sort_order)
select e.id, tier.name, tier.description, tier.price_mwk, tier.capacity_total, tier.available, tier.sort_order
from public.ticket_events e
join (
  values
    ('Melodies & Mimosas', 'Phase 1 Standard', 'Early access ticket with venue entry.', 50000::numeric, 500, true, 10),
    ('Melodies & Mimosas', 'VIP Tickets', 'VIP access with closer stage view.', 300000::numeric, 120, true, 20),
    ('Melodies & Mimosas', 'Golden Circle', 'Closer to the stage with premium experience.', 150000::numeric, 0, false, 30),
    ('Lulu @ 25 The Legacy Concert', 'Standard', 'General concert entry.', 40000::numeric, 800, true, 10),
    ('Lulu @ 25 The Legacy Concert', 'VIP', 'VIP seating and priority entrance.', 120000::numeric, 180, true, 20),
    ('Landlord Pakwao Concert', 'Phase 1 Standard', 'Standard entry ticket.', 50000::numeric, 600, true, 10),
    ('Landlord Pakwao Concert', 'VIP', 'VIP entry with premium section.', 180000::numeric, 150, true, 20)
) as tier(event_title, name, description, price_mwk, capacity_total, available, sort_order)
  on tier.event_title = e.title
where not exists (
  select 1 from public.ticket_tiers existing
  where existing.event_id = e.id and existing.name = tier.name
);
