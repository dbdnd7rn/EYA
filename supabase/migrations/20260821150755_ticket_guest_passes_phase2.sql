begin;

create table if not exists public.ticket_guest_passes (
  id uuid primary key default extensions.gen_random_uuid(),
  issued_ticket_id uuid not null references public.issued_tickets(id) on delete cascade,
  event_id uuid not null references public.ticket_events(id) on delete cascade,
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  mode text not null check (mode in ('live_link','offline')),
  status text not null default 'active' check (status in ('active','revoked','used','expired')),
  guest_name text,
  guest_email text,
  share_token_hash text unique,
  offline_token_hash text unique,
  offline_manual_hash text unique,
  expires_at timestamptz not null,
  replaces_guest_pass_id uuid references public.ticket_guest_passes(id) on delete set null,
  revoked_at timestamptz,
  used_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((mode='live_link' and share_token_hash is not null and offline_token_hash is null and offline_manual_hash is null)
      or (mode='offline' and share_token_hash is null and offline_token_hash is not null and offline_manual_hash is not null))
);

create unique index if not exists ticket_guest_passes_one_active_per_ticket_idx
  on public.ticket_guest_passes(issued_ticket_id) where status='active';
create index if not exists ticket_guest_passes_owner_idx on public.ticket_guest_passes(owner_user_id, created_at desc);
create index if not exists ticket_guest_passes_event_idx on public.ticket_guest_passes(event_id, status);

create table if not exists public.ticket_guest_live_credentials (
  guest_pass_id uuid primary key references public.ticket_guest_passes(id) on delete cascade,
  generation bigint not null default 0,
  current_token_hash text,
  current_manual_hash text,
  current_issued_at timestamptz,
  current_expires_at timestamptz,
  previous_token_hash text,
  previous_manual_hash text,
  previous_expires_at timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.ticket_guest_passes enable row level security;
alter table public.ticket_guest_live_credentials enable row level security;
revoke all on table public.ticket_guest_passes from public, anon, authenticated;
revoke all on table public.ticket_guest_live_credentials from public, anon, authenticated;

drop policy if exists ticket_guest_passes_select_owner_or_admin on public.ticket_guest_passes;
create policy ticket_guest_passes_select_owner_or_admin on public.ticket_guest_passes
  for select to authenticated
  using (owner_user_id=auth.uid() or public.is_admin());
grant select on public.ticket_guest_passes to authenticated;

create or replace function public.create_ticket_guest_pass(
  p_ticket_id uuid,
  p_mode text,
  p_guest_name text default null,
  p_guest_email text default null
)
returns jsonb
language plpgsql
security definer
set search_path=public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_mode text := lower(btrim(coalesce(p_mode,'')));
  v_ticket public.issued_tickets%rowtype;
  v_event public.ticket_events%rowtype;
  v_now timestamptz := clock_timestamp();
  v_expires_at timestamptz;
  v_previous_pass_id uuid;
  v_pass public.ticket_guest_passes%rowtype;
  v_share_token text;
  v_offline_token text;
  v_offline_manual text;
begin
  if v_user_id is null then raise exception 'Authentication required.'; end if;
  if v_mode not in ('live_link','offline') then raise exception 'Unsupported guest pass mode.'; end if;

  select * into v_ticket from public.issued_tickets where id=p_ticket_id for update;
  if not found then raise exception 'Ticket not found.'; end if;
  if v_ticket.user_id <> v_user_id then raise exception 'Only the current ticket holder can create a guest pass.'; end if;
  if v_ticket.status <> 'active' or v_ticket.checked_in_at is not null then raise exception 'This ticket is not available for guest sharing.'; end if;

  select * into v_event from public.ticket_events where id=v_ticket.event_id;
  if not found then raise exception 'Ticket event not found.'; end if;
  v_expires_at := coalesce(v_event.ends_at, case when v_event.starts_at is not null then v_event.starts_at + interval '6 hours' end, v_now + interval '7 days');
  if v_expires_at <= v_now then raise exception 'Guest sharing is closed for this event.'; end if;

  if exists(select 1 from public.ticket_transfers where issued_ticket_id=v_ticket.id and status='pending' and expires_at>v_now) then
    raise exception 'Cancel the pending EYA account transfer before creating a guest pass.';
  end if;

  select id into v_previous_pass_id
  from public.ticket_guest_passes
  where issued_ticket_id=v_ticket.id and status='active'
  for update;

  if v_previous_pass_id is not null then
    update public.ticket_guest_passes
    set status='revoked', revoked_at=v_now, updated_at=v_now
    where id=v_previous_pass_id;
    delete from public.ticket_guest_live_credentials where guest_pass_id=v_previous_pass_id;
  end if;

  update public.ticket_live_credentials
  set current_token_hash=null,current_manual_hash=null,current_issued_at=null,current_expires_at=null,
      previous_token_hash=null,previous_manual_hash=null,previous_expires_at=null,last_issued_to=null,
      generation=generation+1,updated_at=v_now
  where issued_ticket_id=v_ticket.id;

  if v_mode='live_link' then
    v_share_token := 'EYA-GUEST-LINK-1-' || upper(encode(extensions.gen_random_bytes(32),'hex'));
  else
    v_offline_token := 'EYA-OFFLINE-1-' || upper(encode(extensions.gen_random_bytes(24),'hex'));
    v_offline_manual := 'OFF-' || upper(substr(encode(extensions.gen_random_bytes(8),'hex'),1,12));
  end if;

  insert into public.ticket_guest_passes(
    issued_ticket_id,event_id,owner_user_id,mode,status,guest_name,guest_email,
    share_token_hash,offline_token_hash,offline_manual_hash,expires_at,replaces_guest_pass_id,metadata
  ) values (
    v_ticket.id,v_ticket.event_id,v_user_id,v_mode,'active',nullif(btrim(coalesce(p_guest_name,'')),''),
    nullif(lower(btrim(coalesce(p_guest_email,''))),''),
    case when v_share_token is not null then encode(extensions.digest(v_share_token,'sha256'),'hex') end,
    case when v_offline_token is not null then encode(extensions.digest(v_offline_token,'sha256'),'hex') end,
    case when v_offline_manual is not null then encode(extensions.digest(upper(v_offline_manual),'sha256'),'hex') end,
    v_expires_at,v_previous_pass_id,
    jsonb_build_object('ticket_code',v_ticket.ticket_code,'created_as',v_mode)
  ) returning * into v_pass;

  return jsonb_build_object(
    'ok',true,'guest_pass_id',v_pass.id,'ticket_id',v_ticket.id,'mode',v_mode,'status','active',
    'guest_name',v_pass.guest_name,'guest_email',v_pass.guest_email,'expires_at',v_pass.expires_at,
    'share_token',v_share_token,'offline_token',v_offline_token,'offline_manual_code',v_offline_manual,
    'replaced_guest_pass_id',v_previous_pass_id
  );
end;
$$;
revoke all on function public.create_ticket_guest_pass(uuid,text,text,text) from public,anon;
grant execute on function public.create_ticket_guest_pass(uuid,text,text,text) to authenticated;

create or replace function public.revoke_ticket_guest_pass(p_guest_pass_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_pass public.ticket_guest_passes%rowtype;
  v_now timestamptz := clock_timestamp();
begin
  if v_user_id is null then raise exception 'Authentication required.'; end if;
  select * into v_pass from public.ticket_guest_passes where id=p_guest_pass_id for update;
  if not found then raise exception 'Guest pass not found.'; end if;
  if v_pass.owner_user_id <> v_user_id then raise exception 'Only the ticket holder can revoke this guest pass.'; end if;
  if v_pass.status <> 'active' then return jsonb_build_object('ok',true,'status',v_pass.status); end if;

  update public.ticket_guest_passes set status='revoked',revoked_at=v_now,updated_at=v_now where id=v_pass.id;
  delete from public.ticket_guest_live_credentials where guest_pass_id=v_pass.id;
  update public.ticket_live_credentials
    set current_token_hash=null,current_manual_hash=null,current_issued_at=null,current_expires_at=null,
        previous_token_hash=null,previous_manual_hash=null,previous_expires_at=null,last_issued_to=null,
        generation=generation+1,updated_at=v_now
    where issued_ticket_id=v_pass.issued_ticket_id;
  return jsonb_build_object('ok',true,'status','revoked','ticket_id',v_pass.issued_ticket_id);
end;
$$;
revoke all on function public.revoke_ticket_guest_pass(uuid) from public,anon;
grant execute on function public.revoke_ticket_guest_pass(uuid) to authenticated;

create or replace function public.get_my_ticket_guest_passes()
returns jsonb
language sql
stable
security definer
set search_path=public, pg_temp
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',gp.id,'issued_ticket_id',gp.issued_ticket_id,'event_id',gp.event_id,'mode',gp.mode,'status',gp.status,
    'guest_name',gp.guest_name,'guest_email',gp.guest_email,'expires_at',gp.expires_at,
    'revoked_at',gp.revoked_at,'used_at',gp.used_at,'created_at',gp.created_at,
    'ticket_code',it.ticket_code,'event_title',te.title,'event_starts_at',te.starts_at
  ) order by gp.created_at desc),'[]'::jsonb)
  from public.ticket_guest_passes gp
  join public.issued_tickets it on it.id=gp.issued_ticket_id
  join public.ticket_events te on te.id=gp.event_id
  where gp.owner_user_id=auth.uid();
$$;
revoke all on function public.get_my_ticket_guest_passes() from public,anon;
grant execute on function public.get_my_ticket_guest_passes() to authenticated;

create or replace function public.get_ticket_guest_pass_public(p_share_token text)
returns jsonb
language plpgsql
security definer
set search_path=public, pg_temp
as $$
declare
  v_raw text := upper(btrim(coalesce(p_share_token,'')));
  v_hash text;
  v_pass public.ticket_guest_passes%rowtype;
  v_ticket public.issued_tickets%rowtype;
  v_event jsonb;
  v_tier jsonb;
  v_now timestamptz := clock_timestamp();
begin
  if v_raw='' or v_raw not like 'EYA-GUEST-LINK-1-%' then raise exception 'Guest link is invalid.'; end if;
  v_hash := encode(extensions.digest(v_raw,'sha256'),'hex');
  select * into v_pass from public.ticket_guest_passes where share_token_hash=v_hash and mode='live_link' limit 1;
  if not found then raise exception 'Guest link is invalid.'; end if;
  if v_pass.status<>'active' or v_pass.expires_at<=v_now then raise exception 'Guest pass is no longer active.'; end if;
  select * into v_ticket from public.issued_tickets where id=v_pass.issued_ticket_id;
  if not found or v_ticket.status<>'active' or v_ticket.checked_in_at is not null then raise exception 'Ticket is no longer available for entry.'; end if;
  select to_jsonb(e) into v_event from (select id,title,date_label,starts_at,ends_at,venue,city,image_url,hero_image_url from public.ticket_events where id=v_pass.event_id) e;
  select to_jsonb(t) into v_tier from (select id,name,price_mwk from public.ticket_tiers where id=v_ticket.tier_id) t;
  return jsonb_build_object('ok',true,'guest_pass_id',v_pass.id,'ticket_id',v_ticket.id,'guest_name',v_pass.guest_name,
    'expires_at',v_pass.expires_at,'ticket_reference',v_ticket.ticket_code,'event',v_event,'tier',v_tier);
end;
$$;
revoke all on function public.get_ticket_guest_pass_public(text) from public,anon,authenticated;
grant execute on function public.get_ticket_guest_pass_public(text) to service_role;

create or replace function public.issue_ticket_guest_live_credential(p_share_token text)
returns jsonb
language plpgsql
security definer
set search_path=public, pg_temp
as $$
declare
  v_raw text := upper(btrim(coalesce(p_share_token,'')));
  v_hash text;
  v_pass public.ticket_guest_passes%rowtype;
  v_ticket public.issued_tickets%rowtype;
  v_existing public.ticket_guest_live_credentials%rowtype;
  v_now timestamptz := clock_timestamp();
  v_expires_at timestamptz := v_now + interval '60 seconds';
  v_token text;
  v_manual text;
  v_generation bigint;
begin
  if v_raw='' or v_raw not like 'EYA-GUEST-LINK-1-%' then raise exception 'Guest link is invalid.'; end if;
  v_hash := encode(extensions.digest(v_raw,'sha256'),'hex');
  select * into v_pass from public.ticket_guest_passes where share_token_hash=v_hash and mode='live_link' for update;
  if not found then raise exception 'Guest link is invalid.'; end if;
  if v_pass.status<>'active' or v_pass.expires_at<=v_now then raise exception 'Guest pass is no longer active.'; end if;
  select * into v_ticket from public.issued_tickets where id=v_pass.issued_ticket_id for update;
  if not found or v_ticket.status<>'active' or v_ticket.checked_in_at is not null then raise exception 'Ticket is no longer available for entry.'; end if;

  v_token := 'EYA-GUEST-2-' || upper(encode(extensions.gen_random_bytes(24),'hex'));
  v_manual := 'GUEST-' || upper(substr(encode(extensions.gen_random_bytes(8),'hex'),1,10));

  select * into v_existing from public.ticket_guest_live_credentials where guest_pass_id=v_pass.id for update;
  if found then
    v_generation := v_existing.generation + 1;
    update public.ticket_guest_live_credentials
    set generation=v_generation,
        previous_token_hash=case when v_existing.current_token_hash is not null and v_existing.current_expires_at>v_now then v_existing.current_token_hash end,
        previous_manual_hash=case when v_existing.current_manual_hash is not null and v_existing.current_expires_at>v_now then v_existing.current_manual_hash end,
        previous_expires_at=case when v_existing.current_expires_at>v_now then least(v_existing.current_expires_at,v_now+interval '15 seconds') end,
        current_token_hash=encode(extensions.digest(v_token,'sha256'),'hex'),
        current_manual_hash=encode(extensions.digest(upper(v_manual),'sha256'),'hex'),
        current_issued_at=v_now,current_expires_at=v_expires_at,updated_at=v_now
    where guest_pass_id=v_pass.id;
  else
    v_generation := 1;
    insert into public.ticket_guest_live_credentials(guest_pass_id,generation,current_token_hash,current_manual_hash,current_issued_at,current_expires_at,updated_at)
    values(v_pass.id,v_generation,encode(extensions.digest(v_token,'sha256'),'hex'),encode(extensions.digest(upper(v_manual),'sha256'),'hex'),v_now,v_expires_at,v_now);
  end if;

  return jsonb_build_object('version',2,'kind','eya_guest_live_ticket','token',v_token,'manual_code',v_manual,
    'issued_at',v_now,'expires_at',v_expires_at,'refresh_after_seconds',25,'ttl_seconds',60,'generation',v_generation);
end;
$$;
revoke all on function public.issue_ticket_guest_live_credential(text) from public,anon,authenticated;
grant execute on function public.issue_ticket_guest_live_credential(text) to service_role;

create or replace function public.check_in_ticket_entry_credential(
  p_credential text,
  p_event_id uuid default null,
  p_device_label text default null,
  p_method text default 'qr'
)
returns jsonb
language plpgsql
security definer
set search_path=public, pg_temp
as $$
declare
  v_admin_id uuid := auth.uid();
  v_now timestamptz := clock_timestamp();
  v_method text := lower(btrim(coalesce(p_method,'qr')));
  v_raw text := upper(btrim(coalesce(p_credential,'')));
  v_hash text;
  v_ticket_id uuid;
  v_guest_pass_id uuid;
  v_kind text;
  v_generation bigint;
  v_ticket public.issued_tickets%rowtype;
  v_checkin public.ticket_checkins%rowtype;
  v_guest public.ticket_guest_passes%rowtype;
  v_event jsonb;
  v_tier jsonb;
  v_order jsonb;
  v_user jsonb;
begin
  if v_admin_id is null or not public.is_admin() then raise exception 'Admin access required.'; end if;
  if v_method not in ('qr','manual') then raise exception 'Unsupported check-in method.'; end if;
  if v_raw='' then raise exception 'Entry credential is required.'; end if;
  v_hash := encode(extensions.digest(v_raw,'sha256'),'hex');

  if v_method='qr' and v_raw like 'EYA-LIVE-2-%' then
    select tlc.issued_ticket_id, 'personal_live', tlc.generation into v_ticket_id,v_kind,v_generation
    from public.ticket_live_credentials tlc
    where (tlc.current_token_hash=v_hash and tlc.current_expires_at>v_now)
       or (tlc.previous_token_hash=v_hash and tlc.previous_expires_at>v_now)
    limit 1;
  elsif v_method='manual' and v_raw like 'LIVE-%' then
    select tlc.issued_ticket_id, 'personal_live', tlc.generation into v_ticket_id,v_kind,v_generation
    from public.ticket_live_credentials tlc
    where (tlc.current_manual_hash=v_hash and tlc.current_expires_at>v_now)
       or (tlc.previous_manual_hash=v_hash and tlc.previous_expires_at>v_now)
    limit 1;
  elsif v_method='qr' and v_raw like 'EYA-GUEST-2-%' then
    select gp.issued_ticket_id,gp.id,'guest_live',glc.generation into v_ticket_id,v_guest_pass_id,v_kind,v_generation
    from public.ticket_guest_live_credentials glc join public.ticket_guest_passes gp on gp.id=glc.guest_pass_id
    where gp.status='active' and gp.expires_at>v_now and ((glc.current_token_hash=v_hash and glc.current_expires_at>v_now) or (glc.previous_token_hash=v_hash and glc.previous_expires_at>v_now))
    limit 1;
  elsif v_method='manual' and v_raw like 'GUEST-%' then
    select gp.issued_ticket_id,gp.id,'guest_live',glc.generation into v_ticket_id,v_guest_pass_id,v_kind,v_generation
    from public.ticket_guest_live_credentials glc join public.ticket_guest_passes gp on gp.id=glc.guest_pass_id
    where gp.status='active' and gp.expires_at>v_now and ((glc.current_manual_hash=v_hash and glc.current_expires_at>v_now) or (glc.previous_manual_hash=v_hash and glc.previous_expires_at>v_now))
    limit 1;
  elsif v_method='qr' and v_raw like 'EYA-OFFLINE-1-%' then
    select gp.issued_ticket_id,gp.id,'offline_guest' into v_ticket_id,v_guest_pass_id,v_kind
    from public.ticket_guest_passes gp where gp.mode='offline' and gp.status='active' and gp.expires_at>v_now and gp.offline_token_hash=v_hash limit 1;
  elsif v_method='manual' and v_raw like 'OFF-%' then
    select gp.issued_ticket_id,gp.id,'offline_guest' into v_ticket_id,v_guest_pass_id,v_kind
    from public.ticket_guest_passes gp where gp.mode='offline' and gp.status='active' and gp.expires_at>v_now and gp.offline_manual_hash=v_hash limit 1;
  end if;

  if v_ticket_id is null then raise exception 'Entry credential is invalid or expired.'; end if;
  select * into v_ticket from public.issued_tickets where id=v_ticket_id for update;
  if not found then raise exception 'Ticket not found.'; end if;
  if p_event_id is not null and v_ticket.event_id<>p_event_id then raise exception 'Ticket is for another event.'; end if;
  if v_ticket.status<>'active' then raise exception 'Ticket is %.',v_ticket.status; end if;
  if v_ticket.checked_in_at is not null then raise exception 'Ticket has already been checked in.'; end if;

  if v_guest_pass_id is not null then
    select * into v_guest from public.ticket_guest_passes where id=v_guest_pass_id for update;
    if not found or v_guest.status<>'active' or v_guest.expires_at<=v_now then raise exception 'Guest pass is no longer active.'; end if;
  end if;

  update public.issued_tickets
  set status='used',checked_in_at=v_now,checked_in_by=v_admin_id,updated_at=v_now
  where id=v_ticket.id and status='active' and checked_in_at is null
  returning * into v_ticket;
  if not found then raise exception 'Ticket has already been checked in.'; end if;

  insert into public.ticket_checkins(issued_ticket_id,event_id,checked_in_by,method,device_label,metadata)
  values(v_ticket.id,v_ticket.event_id,v_admin_id,v_method,nullif(btrim(coalesce(p_device_label,'')),''),
    jsonb_build_object('credential_kind',v_kind,'credential_version',case when v_kind in ('personal_live','guest_live') then 2 else 1 end,
      'credential_generation',v_generation,'guest_pass_id',v_guest_pass_id))
  returning * into v_checkin;

  update public.ticket_live_credentials
  set current_token_hash=null,current_manual_hash=null,current_issued_at=null,current_expires_at=null,
      previous_token_hash=null,previous_manual_hash=null,previous_expires_at=null,last_issued_to=null,updated_at=v_now
  where issued_ticket_id=v_ticket.id;

  delete from public.ticket_guest_live_credentials glc using public.ticket_guest_passes gp
  where glc.guest_pass_id=gp.id and gp.issued_ticket_id=v_ticket.id;

  update public.ticket_guest_passes
  set status='used',used_at=v_now,updated_at=v_now
  where issued_ticket_id=v_ticket.id and status='active';

  select to_jsonb(e) into v_event from (select id,title,date_label,venue,city from public.ticket_events where id=v_ticket.event_id) e;
  select to_jsonb(t) into v_tier from (select id,name,price_mwk from public.ticket_tiers where id=v_ticket.tier_id) t;
  select to_jsonb(o) into v_order from (select id,total_mwk,quantity,payment_status,paid_at from public.ticket_orders where id=v_ticket.order_id) o;
  select to_jsonb(u) into v_user from (select id,full_name,email,phone from public.profiles where id=v_ticket.user_id) u;

  return jsonb_build_object('status','success','credential_kind',v_kind,
    'guest_pass',case when v_guest_pass_id is not null then jsonb_build_object('id',v_guest_pass_id,'guest_name',v_guest.guest_name,'mode',v_guest.mode) else null end,
    'ticket',to_jsonb(v_ticket)||jsonb_build_object('event',v_event,'tier',v_tier,'order',v_order,'user',v_user),
    'checkin',to_jsonb(v_checkin));
end;
$$;
revoke all on function public.check_in_ticket_entry_credential(text,uuid,text,text) from public,anon;
grant execute on function public.check_in_ticket_entry_credential(text,uuid,text,text) to authenticated;

create or replace function public.issue_ticket_live_credential(p_ticket_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=public, pg_temp
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
  select * into v_ticket from public.issued_tickets where id=p_ticket_id for update;
  if not found then raise exception 'Ticket not found.'; end if;
  if v_ticket.user_id<>v_user_id then raise exception 'This ticket does not belong to the signed-in user.'; end if;
  if v_ticket.status<>'active' or v_ticket.checked_in_at is not null then raise exception 'This ticket is not available for entry.'; end if;
  if exists(select 1 from public.ticket_guest_passes where issued_ticket_id=v_ticket.id and status='active' and expires_at>v_now) then
    raise exception 'This ticket is currently shared as a guest pass. Revoke the guest pass to use your personal live QR.';
  end if;

  v_token := 'EYA-LIVE-2-' || upper(encode(extensions.gen_random_bytes(24),'hex'));
  v_manual_code := 'LIVE-' || upper(substr(encode(extensions.gen_random_bytes(8),'hex'),1,10));
  select * into v_existing from public.ticket_live_credentials where issued_ticket_id=v_ticket.id for update;
  if found then
    v_generation := v_existing.generation+1;
    update public.ticket_live_credentials set generation=v_generation,
      previous_token_hash=case when v_existing.current_token_hash is not null and v_existing.current_expires_at>v_now then v_existing.current_token_hash end,
      previous_manual_hash=case when v_existing.current_manual_hash is not null and v_existing.current_expires_at>v_now then v_existing.current_manual_hash end,
      previous_expires_at=case when v_existing.current_expires_at>v_now then least(v_existing.current_expires_at,v_now+interval '15 seconds') end,
      current_token_hash=encode(extensions.digest(v_token,'sha256'),'hex'),current_manual_hash=encode(extensions.digest(upper(v_manual_code),'sha256'),'hex'),
      current_issued_at=v_now,current_expires_at=v_expires_at,last_issued_to=v_user_id,updated_at=v_now where issued_ticket_id=v_ticket.id;
  else
    v_generation:=1;
    insert into public.ticket_live_credentials(issued_ticket_id,generation,current_token_hash,current_manual_hash,current_issued_at,current_expires_at,last_issued_to,updated_at)
    values(v_ticket.id,v_generation,encode(extensions.digest(v_token,'sha256'),'hex'),encode(extensions.digest(upper(v_manual_code),'sha256'),'hex'),v_now,v_expires_at,v_user_id,v_now);
  end if;
  return jsonb_build_object('version',2,'kind','eya_live_ticket','token',v_token,'manual_code',v_manual_code,
    'issued_at',v_now,'expires_at',v_expires_at,'refresh_after_seconds',25,'ttl_seconds',60,'generation',v_generation);
end;
$$;
revoke all on function public.issue_ticket_live_credential(uuid) from public,anon;
grant execute on function public.issue_ticket_live_credential(uuid) to authenticated;

create or replace function public.ticket_transfer_guest_guard()
returns trigger
language plpgsql
security definer
set search_path=public, pg_temp
as $$
begin
  if new.status='pending' and exists(select 1 from public.ticket_guest_passes where issued_ticket_id=new.issued_ticket_id and status='active' and expires_at>clock_timestamp()) then
    raise exception 'Revoke the active guest pass before transferring this ticket to an EYA account.';
  end if;
  return new;
end;
$$;
drop trigger if exists ticket_transfer_guest_guard_trigger on public.ticket_transfers;
create trigger ticket_transfer_guest_guard_trigger before insert or update of status on public.ticket_transfers
for each row execute function public.ticket_transfer_guest_guard();

commit;
