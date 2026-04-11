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

drop trigger if exists trg_campus_market_order_handoffs_updated_at on campus_market.order_handoffs;
create trigger trg_campus_market_order_handoffs_updated_at
before update on campus_market.order_handoffs
for each row execute function campus_market.set_updated_at();

grant select, insert, update on campus_market.order_handoffs to authenticated;
grant all on campus_market.order_handoffs to service_role;

alter table campus_market.order_handoffs enable row level security;

drop policy if exists "cm_order_handoffs_select_participants" on campus_market.order_handoffs;
create policy "cm_order_handoffs_select_participants" on campus_market.order_handoffs
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

drop policy if exists "cm_order_handoffs_update_driver_or_vendor" on campus_market.order_handoffs;
create policy "cm_order_handoffs_update_driver_or_vendor" on campus_market.order_handoffs
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

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'campus_market'
      and tablename = 'order_handoffs'
  ) then
    alter publication supabase_realtime add table campus_market.order_handoffs;
  end if;
end $$;
