begin;

create table if not exists public.ticket_transfers (
  id uuid primary key default extensions.gen_random_uuid(),
  issued_ticket_id uuid not null references public.issued_tickets(id) on delete cascade,
  event_id uuid not null references public.ticket_events(id) on delete cascade,
  sender_user_id uuid not null references auth.users(id) on delete cascade,
  recipient_user_id uuid not null references auth.users(id) on delete cascade,
  recipient_email text not null,
  status text not null default 'pending' check (status in ('pending','accepted','declined','cancelled','expired')),
  requested_at timestamptz not null default now(),
  responded_at timestamptz,
  expires_at timestamptz not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists ticket_transfers_one_pending_per_ticket_idx
  on public.ticket_transfers(issued_ticket_id)
  where status = 'pending';
create index if not exists ticket_transfers_sender_idx on public.ticket_transfers(sender_user_id, requested_at desc);
create index if not exists ticket_transfers_recipient_idx on public.ticket_transfers(recipient_user_id, requested_at desc);
create index if not exists ticket_transfers_expiry_idx on public.ticket_transfers(expires_at) where status = 'pending';

create table if not exists public.ticket_ownership_history (
  id uuid primary key default extensions.gen_random_uuid(),
  issued_ticket_id uuid not null references public.issued_tickets(id) on delete cascade,
  event_id uuid not null references public.ticket_events(id) on delete cascade,
  previous_user_id uuid references auth.users(id) on delete set null,
  new_user_id uuid references auth.users(id) on delete set null,
  transfer_id uuid references public.ticket_transfers(id) on delete set null,
  action text not null check (action in ('transfer_accepted','admin_reassigned','guest_delegated','guest_reclaimed')),
  actor_user_id uuid references auth.users(id) on delete set null,
  occurred_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);
create index if not exists ticket_ownership_history_ticket_idx on public.ticket_ownership_history(issued_ticket_id, occurred_at desc);

alter table public.ticket_transfers enable row level security;
alter table public.ticket_ownership_history enable row level security;

revoke all on table public.ticket_transfers from public, anon, authenticated;
revoke all on table public.ticket_ownership_history from public, anon, authenticated;
grant select on table public.ticket_transfers to authenticated;
grant select on table public.ticket_ownership_history to authenticated;

drop policy if exists ticket_transfers_select_party_or_admin on public.ticket_transfers;
create policy ticket_transfers_select_party_or_admin
on public.ticket_transfers for select to authenticated
using (sender_user_id = auth.uid() or recipient_user_id = auth.uid() or public.is_admin());

drop policy if exists ticket_ownership_history_select_party_or_admin on public.ticket_ownership_history;
create policy ticket_ownership_history_select_party_or_admin
on public.ticket_ownership_history for select to authenticated
using (
  previous_user_id = auth.uid()
  or new_user_id = auth.uid()
  or exists (
    select 1 from public.issued_tickets it
    where it.id = issued_ticket_id and it.user_id = auth.uid()
  )
  or public.is_admin()
);

create or replace function public.request_ticket_transfer(p_ticket_id uuid, p_recipient_email text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_email text := lower(btrim(coalesce(p_recipient_email, '')));
  v_ticket public.issued_tickets%rowtype;
  v_event public.ticket_events%rowtype;
  v_recipient_id uuid;
  v_recipient_name text;
  v_expires_at timestamptz;
  v_transfer public.ticket_transfers%rowtype;
begin
  if v_user_id is null then raise exception 'Authentication required.'; end if;
  if v_email = '' or position('@' in v_email) < 2 then raise exception 'Enter a valid recipient email.'; end if;

  select * into v_ticket from public.issued_tickets where id = p_ticket_id for update;
  if not found then raise exception 'Ticket not found.'; end if;
  if v_ticket.user_id <> v_user_id then raise exception 'Only the current ticket holder can transfer this ticket.'; end if;
  if v_ticket.status <> 'active' or v_ticket.checked_in_at is not null then raise exception 'This ticket can no longer be transferred.'; end if;

  select * into v_event from public.ticket_events where id = v_ticket.event_id;
  if not found then raise exception 'Ticket event not found.'; end if;

  v_expires_at := coalesce(v_event.ends_at, case when v_event.starts_at is not null then v_event.starts_at + interval '6 hours' else null end, clock_timestamp() + interval '7 days');
  if v_expires_at <= clock_timestamp() then raise exception 'Transfers are closed for this event.'; end if;

  select p.id, nullif(btrim(p.full_name), '')
  into v_recipient_id, v_recipient_name
  from public.profiles p
  where lower(btrim(coalesce(p.email, ''))) = v_email
  limit 1;

  if v_recipient_id is null then raise exception 'No EYA account was found for that email.'; end if;
  if v_recipient_id = v_user_id then raise exception 'You already hold this ticket.'; end if;

  update public.ticket_transfers
  set status = 'expired', responded_at = clock_timestamp(), updated_at = clock_timestamp()
  where issued_ticket_id = v_ticket.id and status = 'pending' and expires_at <= clock_timestamp();

  if exists (select 1 from public.ticket_transfers where issued_ticket_id = v_ticket.id and status = 'pending') then
    raise exception 'This ticket already has a pending transfer.';
  end if;

  insert into public.ticket_transfers (
    issued_ticket_id, event_id, sender_user_id, recipient_user_id,
    recipient_email, expires_at, metadata
  ) values (
    v_ticket.id, v_ticket.event_id, v_user_id, v_recipient_id,
    v_email, v_expires_at, jsonb_build_object('ticket_code', v_ticket.ticket_code)
  ) returning * into v_transfer;

  return jsonb_build_object(
    'ok', true,
    'transfer_id', v_transfer.id,
    'status', v_transfer.status,
    'ticket_id', v_ticket.id,
    'recipient_name', coalesce(v_recipient_name, 'EYA user'),
    'recipient_email', v_email,
    'expires_at', v_transfer.expires_at
  );
end;
$$;

create or replace function public.accept_ticket_transfer(p_transfer_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_transfer public.ticket_transfers%rowtype;
  v_ticket public.issued_tickets%rowtype;
  v_now timestamptz := clock_timestamp();
begin
  if v_user_id is null then raise exception 'Authentication required.'; end if;

  select * into v_transfer from public.ticket_transfers where id = p_transfer_id for update;
  if not found then raise exception 'Transfer not found.'; end if;
  if v_transfer.recipient_user_id <> v_user_id then raise exception 'This transfer is not addressed to your account.'; end if;
  if v_transfer.status <> 'pending' then raise exception 'This transfer is no longer pending.'; end if;

  if v_transfer.expires_at <= v_now then
    update public.ticket_transfers set status='expired', responded_at=v_now, updated_at=v_now where id=v_transfer.id;
    return jsonb_build_object('ok', false, 'status', 'expired', 'message', 'This transfer has expired.');
  end if;

  select * into v_ticket from public.issued_tickets where id = v_transfer.issued_ticket_id for update;
  if not found then raise exception 'Ticket not found.'; end if;
  if v_ticket.user_id <> v_transfer.sender_user_id then raise exception 'Ticket ownership changed before this transfer was accepted.'; end if;
  if v_ticket.status <> 'active' or v_ticket.checked_in_at is not null then raise exception 'This ticket can no longer be transferred.'; end if;

  update public.issued_tickets
  set user_id = v_user_id,
      metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('last_transfer_id', v_transfer.id, 'last_transferred_at', v_now),
      updated_at = v_now
  where id = v_ticket.id;

  update public.ticket_live_credentials
  set current_token_hash=null,
      current_manual_hash=null,
      current_issued_at=null,
      current_expires_at=null,
      previous_token_hash=null,
      previous_manual_hash=null,
      previous_expires_at=null,
      last_issued_to=null,
      generation=generation+1,
      updated_at=v_now
  where issued_ticket_id = v_ticket.id;

  update public.ticket_transfers
  set status='accepted', responded_at=v_now, updated_at=v_now
  where id=v_transfer.id;

  insert into public.ticket_ownership_history (
    issued_ticket_id, event_id, previous_user_id, new_user_id,
    transfer_id, action, actor_user_id, occurred_at
  ) values (
    v_ticket.id, v_ticket.event_id, v_transfer.sender_user_id, v_user_id,
    v_transfer.id, 'transfer_accepted', v_user_id, v_now
  );

  return jsonb_build_object(
    'ok', true,
    'status', 'accepted',
    'ticket_id', v_ticket.id,
    'previous_user_id', v_transfer.sender_user_id,
    'new_user_id', v_user_id
  );
end;
$$;

create or replace function public.decline_ticket_transfer(p_transfer_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_transfer public.ticket_transfers%rowtype;
  v_now timestamptz := clock_timestamp();
begin
  if v_user_id is null then raise exception 'Authentication required.'; end if;
  select * into v_transfer from public.ticket_transfers where id=p_transfer_id for update;
  if not found then raise exception 'Transfer not found.'; end if;
  if v_transfer.recipient_user_id <> v_user_id then raise exception 'This transfer is not addressed to your account.'; end if;
  if v_transfer.status <> 'pending' then raise exception 'This transfer is no longer pending.'; end if;
  update public.ticket_transfers set status='declined', responded_at=v_now, updated_at=v_now where id=v_transfer.id;
  return jsonb_build_object('ok', true, 'status', 'declined', 'transfer_id', v_transfer.id);
end;
$$;

create or replace function public.cancel_ticket_transfer(p_transfer_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_transfer public.ticket_transfers%rowtype;
  v_now timestamptz := clock_timestamp();
begin
  if v_user_id is null then raise exception 'Authentication required.'; end if;
  select * into v_transfer from public.ticket_transfers where id=p_transfer_id for update;
  if not found then raise exception 'Transfer not found.'; end if;
  if v_transfer.sender_user_id <> v_user_id then raise exception 'Only the sender can cancel this transfer.'; end if;
  if v_transfer.status <> 'pending' then raise exception 'This transfer is no longer pending.'; end if;
  update public.ticket_transfers set status='cancelled', responded_at=v_now, updated_at=v_now where id=v_transfer.id;
  return jsonb_build_object('ok', true, 'status', 'cancelled', 'transfer_id', v_transfer.id);
end;
$$;

create or replace function public.get_my_ticket_transfers()
returns jsonb
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  with me as (select auth.uid() as uid),
  rows as (
    select
      tt.*,
      te.title as event_title,
      te.starts_at as event_starts_at,
      it.ticket_code,
      sp.full_name as sender_name,
      rp.full_name as recipient_name
    from public.ticket_transfers tt
    join me on me.uid is not null
    join public.issued_tickets it on it.id=tt.issued_ticket_id
    join public.ticket_events te on te.id=tt.event_id
    left join public.profiles sp on sp.id=tt.sender_user_id
    left join public.profiles rp on rp.id=tt.recipient_user_id
    where tt.sender_user_id=me.uid or tt.recipient_user_id=me.uid
    order by tt.requested_at desc
    limit 200
  )
  select jsonb_build_object(
    'incoming', coalesce(jsonb_agg(to_jsonb(rows) order by requested_at desc) filter (where recipient_user_id=(select uid from me)), '[]'::jsonb),
    'outgoing', coalesce(jsonb_agg(to_jsonb(rows) order by requested_at desc) filter (where sender_user_id=(select uid from me)), '[]'::jsonb)
  ) from rows;
$$;

revoke all on function public.request_ticket_transfer(uuid,text) from public, anon;
revoke all on function public.accept_ticket_transfer(uuid) from public, anon;
revoke all on function public.decline_ticket_transfer(uuid) from public, anon;
revoke all on function public.cancel_ticket_transfer(uuid) from public, anon;
revoke all on function public.get_my_ticket_transfers() from public, anon;

grant execute on function public.request_ticket_transfer(uuid,text) to authenticated;
grant execute on function public.accept_ticket_transfer(uuid) to authenticated;
grant execute on function public.decline_ticket_transfer(uuid) to authenticated;
grant execute on function public.cancel_ticket_transfer(uuid) to authenticated;
grant execute on function public.get_my_ticket_transfers() to authenticated;

commit;
