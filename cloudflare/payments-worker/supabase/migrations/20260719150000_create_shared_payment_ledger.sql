create extension if not exists pgcrypto;

create table if not exists public.payment_applications (
  id text primary key,
  name text not null,
  callback_url text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.payment_intents (
  id uuid primary key default gen_random_uuid(),
  app_id text not null references public.payment_applications(id),
  app_payment_id text not null,
  app_user_id text,
  purpose text not null,
  provider text not null default 'paychangu',
  method text not null,
  merchant_reference text not null unique,
  provider_reference text unique,
  expected_amount_mwk bigint not null check (expected_amount_mwk > 0),
  paid_amount_mwk bigint,
  currency text not null default 'MWK' check (currency = 'MWK'),
  status text not null default 'created' check (
    status in ('created', 'pending', 'paid', 'failed', 'cancelled', 'expired')
  ),
  customer_email text,
  customer_phone text,
  title text,
  description text,
  metadata jsonb not null default '{}'::jsonb,
  provider_payload jsonb not null default '{}'::jsonb,
  failure_reason text,
  paid_at timestamptz,
  verified_at timestamptz,
  fulfilled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (app_id, app_payment_id)
);

create index if not exists payment_intents_app_status_idx
  on public.payment_intents (app_id, status, created_at desc);

create index if not exists payment_intents_provider_reference_idx
  on public.payment_intents (provider_reference)
  where provider_reference is not null;

create table if not exists public.payment_webhook_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'paychangu',
  event_key text not null,
  payment_intent_id uuid references public.payment_intents(id),
  signature_valid boolean not null default false,
  status text not null default 'received' check (
    status in ('received', 'processing', 'processed', 'ignored', 'failed')
  ),
  payload jsonb not null default '{}'::jsonb,
  error_message text,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  unique (provider, event_key)
);

create table if not exists public.payment_outbox_events (
  id uuid primary key default gen_random_uuid(),
  payment_intent_id uuid not null references public.payment_intents(id),
  app_id text not null references public.payment_applications(id),
  event_type text not null,
  idempotency_key text not null unique,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (
    status in ('pending', 'delivering', 'delivered', 'failed')
  ),
  attempts integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  last_error text,
  delivered_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists payment_outbox_pending_idx
  on public.payment_outbox_events (status, next_attempt_at)
  where status in ('pending', 'failed');

create or replace function public.set_payment_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_payment_applications_updated_at on public.payment_applications;
create trigger set_payment_applications_updated_at
before update on public.payment_applications
for each row execute function public.set_payment_updated_at();

drop trigger if exists set_payment_intents_updated_at on public.payment_intents;
create trigger set_payment_intents_updated_at
before update on public.payment_intents
for each row execute function public.set_payment_updated_at();

drop trigger if exists set_payment_outbox_updated_at on public.payment_outbox_events;
create trigger set_payment_outbox_updated_at
before update on public.payment_outbox_events
for each row execute function public.set_payment_updated_at();

alter table public.payment_applications enable row level security;
alter table public.payment_intents enable row level security;
alter table public.payment_webhook_events enable row level security;
alter table public.payment_outbox_events enable row level security;

comment on table public.payment_intents is
  'Provider-independent payment ledger. Direct client access is intentionally blocked by RLS; the payments worker uses a server secret.';
