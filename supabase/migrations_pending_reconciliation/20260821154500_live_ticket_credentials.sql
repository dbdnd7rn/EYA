begin;

-- Ticket fulfilment owns ticket issuance. This separate table owns only
-- short-lived admission credentials for already-issued tickets.
create table if not exists public.ticket_live_credentials (
  issued_ticket_id uuid primary key references public.issued_tickets(id) on delete cascade,
  generation bigint not null default 0,
  current_token_hash text,
  current_manual_hash text,
  current_issued_at timestamptz,
  current_expires_at timestamptz,
  previous_token_hash text,
  previous_manual_hash text,
  previous_expires_at timestamptz,
  last_issued_to uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table public.ticket_live_credentials enable row level security;
revoke all on table public.ticket_live_credentials from public, anon, authenticated;

create index if not exists ticket_live_credentials_current_expiry_idx
  on public.ticket_live_credentials(current_expires_at)
  where current_expires_at is not null;

create or replace function public.issue_ticket_live_credential(p_ticket_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_ticket public.issued_tickets%rowtype;
  v_existing public.ticket_live_credentials%rowtype;
  v_now timestamptz := clock_timestamp();
  v_expires_at timestamptz := v_now + interval '60 seconds';
  v_token text;
  v_manual_code text;
  v_generation bigint;
begin
  if v_user_id is null then raise exception 'Authentication required.'; end if;

  select * into v_ticket
  from public.issued_tickets
  where id = p_ticket_id
  for update;

  if not found then raise exception 'Ticket not found.'; end if;
  if v_ticket.user_id <> v_user_id then raise exception 'This ticket does not belong to the signed-in user.'; end if;
  if v_ticket.status <> 'active' or v_ticket.checked_in_at is not null then raise exception 'This ticket is not available for entry.'; end if;

  v_token := 'EYA-LIVE-2-' || upper(encode(extensions.gen_random_bytes(24), 'hex'));
  v_manual_code := 'LIVE-' || upper(substr(encode(extensions.gen_random_bytes(8), 'hex'), 1, 10));

  select * into v_existing
  from public.ticket_live_credentials
  where issued_ticket_id = v_ticket.id
  for update;

  if found then
    v_generation := v_existing.generation + 1;
    update public.ticket_live_credentials
    set generation = v_generation,
        previous_token_hash = case when v_existing.current_token_hash is not null and v_existing.current_expires_at > v_now then v_existing.current_token_hash end,
        previous_manual_hash = case when v_existing.current_manual_hash is not null and v_existing.current_expires_at > v_now then v_existing.current_manual_hash end,
        previous_expires_at = case when v_existing.current_expires_at > v_now then least(v_existing.current_expires_at, v_now + interval '15 seconds') end,
        current_token_hash = encode(extensions.digest(v_token, 'sha256'), 'hex'),
        current_manual_hash = encode(extensions.digest(upper(v_manual_code), 'sha256'), 'hex'),
        current_issued_at = v_now,
        current_expires_at = v_expires_at,
        last_issued_to = v_user_id,
        updated_at = v_now
    where issued_ticket_id = v_ticket.id;
  else
    v_generation := 1;
    insert into public.ticket_live_credentials(
      issued_ticket_id,generation,current_token_hash,current_manual_hash,current_issued_at,current_expires_at,last_issued_to,updated_at
    ) values (
      v_ticket.id,v_generation,
      encode(extensions.digest(v_token, 'sha256'), 'hex'),
      encode(extensions.digest(upper(v_manual_code), 'sha256'), 'hex'),
      v_now,v_expires_at,v_user_id,v_now
    );
  end if;

  return jsonb_build_object(
    'version',2,
    'kind','eya_live_ticket',
    'token',v_token,
    'manual_code',v_manual_code,
    'issued_at',v_now,
    'expires_at',v_expires_at,
    'refresh_after_seconds',25,
    'ttl_seconds',60,
    'generation',v_generation
  );
end;
$$;

revoke all on function public.issue_ticket_live_credential(uuid) from public, anon;
grant execute on function public.issue_ticket_live_credential(uuid) to authenticated;

create or replace function public.check_in_ticket_live_credential(
  p_credential text,
  p_event_id uuid default null,
  p_device_label text default null,
  p_method text default 'qr'
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_admin_id uuid := auth.uid();
  v_now timestamptz := clock_timestamp();
  v_method text := lower(btrim(coalesce(p_method, 'qr')));
  v_raw text := btrim(coalesce(p_credential, ''));
  v_hash text;
  v_ticket_id uuid;
  v_ticket public.issued_tickets%rowtype;
  v_generation bigint;
  v_checkin public.ticket_checkins%rowtype;
  v_event jsonb;
  v_tier jsonb;
  v_order jsonb;
  v_user jsonb;
begin
  if v_admin_id is null or not public.is_admin() then raise exception 'Admin access required.'; end if;
  if v_method not in ('qr','manual') then raise exception 'Unsupported check-in method.'; end if;
  if v_raw = '' then raise exception 'Live credential is required.'; end if;

  v_hash := encode(extensions.digest(case when v_method='manual' then upper(v_raw) else v_raw end, 'sha256'), 'hex');

  select tlc.issued_ticket_id, tlc.generation
  into v_ticket_id, v_generation
  from public.ticket_live_credentials tlc
  where (
    v_method='qr' and (
      (tlc.current_token_hash=v_hash and tlc.current_expires_at>v_now) or
      (tlc.previous_token_hash=v_hash and tlc.previous_expires_at>v_now)
    )
  ) or (
    v_method='manual' and (
      (tlc.current_manual_hash=v_hash and tlc.current_expires_at>v_now) or
      (tlc.previous_manual_hash=v_hash and tlc.previous_expires_at>v_now)
    )
  )
  limit 1
  for update;

  if not found then raise exception 'Live credential is invalid or expired.'; end if;

  select * into v_ticket
  from public.issued_tickets
  where id=v_ticket_id
  for update;

  if not found then raise exception 'Ticket not found.'; end if;
  if p_event_id is not null and v_ticket.event_id<>p_event_id then raise exception 'Ticket is for another event.'; end if;
  if v_ticket.status<>'active' then raise exception 'Ticket is %.',v_ticket.status; end if;
  if v_ticket.checked_in_at is not null then raise exception 'Ticket has already been checked in.'; end if;

  update public.issued_tickets
  set status='used',checked_in_at=v_now,checked_in_by=v_admin_id,updated_at=v_now
  where id=v_ticket.id and status='active' and checked_in_at is null
  returning * into v_ticket;

  if not found then raise exception 'Ticket has already been checked in.'; end if;

  insert into public.ticket_checkins(issued_ticket_id,event_id,checked_in_by,method,device_label,metadata)
  values(
    v_ticket.id,v_ticket.event_id,v_admin_id,v_method,nullif(btrim(coalesce(p_device_label,'')),''),
    jsonb_build_object('credential_kind','eya_live_ticket','credential_version',2,'credential_generation',v_generation)
  ) returning * into v_checkin;

  update public.ticket_live_credentials
  set current_token_hash=null,current_manual_hash=null,current_issued_at=null,current_expires_at=null,
      previous_token_hash=null,previous_manual_hash=null,previous_expires_at=null,updated_at=v_now
  where issued_ticket_id=v_ticket.id;

  select to_jsonb(e) into v_event from (select id,title,date_label,venue,city from public.ticket_events where id=v_ticket.event_id) e;
  select to_jsonb(t) into v_tier from (select id,name,price_mwk from public.ticket_tiers where id=v_ticket.tier_id) t;
  select to_jsonb(o) into v_order from (select id,total_mwk,quantity,payment_status,paid_at from public.ticket_orders where id=v_ticket.order_id) o;
  select to_jsonb(u) into v_user from (select id,full_name,email,phone from public.profiles where id=v_ticket.user_id) u;

  return jsonb_build_object(
    'status','success',
    'ticket',to_jsonb(v_ticket)||jsonb_build_object('event',v_event,'tier',v_tier,'order',v_order,'user',v_user),
    'checkin',to_jsonb(v_checkin)
  );
end;
$$;

revoke all on function public.check_in_ticket_live_credential(text,uuid,text,text) from public, anon;
grant execute on function public.check_in_ticket_live_credential(text,uuid,text,text) to authenticated;

commit;
