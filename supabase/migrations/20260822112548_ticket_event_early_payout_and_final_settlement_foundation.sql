create table if not exists public.ticket_event_finance_controls (
  event_id uuid primary key references public.ticket_events(id) on delete restrict,
  organizer_id uuid not null references auth.users(id) on delete restrict,
  reserve_required_mwk numeric(14,2) not null default 0 check (reserve_required_mwk >= 0),
  platform_fee_mwk numeric(14,2) not null default 0 check (platform_fee_mwk >= 0),
  other_hold_mwk numeric(14,2) not null default 0 check (other_hold_mwk >= 0),
  status text not null default 'open' check (status in ('open','frozen','settled')),
  admin_note text,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ticket_event_finance_control_log (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.ticket_events(id) on delete restrict,
  actor_id uuid references auth.users(id) on delete set null,
  action text not null,
  previous_state jsonb,
  new_state jsonb not null,
  note text,
  created_at timestamptz not null default now()
);

create index if not exists ticket_event_finance_control_log_event_idx
  on public.ticket_event_finance_control_log(event_id, created_at desc);

create table if not exists public.ticket_event_payout_requests (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.ticket_events(id) on delete restrict,
  organizer_id uuid not null references auth.users(id) on delete restrict,
  request_type text not null check (request_type in ('early_payout','final_settlement')),
  requested_amount_mwk numeric(14,2) not null check (requested_amount_mwk > 0),
  approved_amount_mwk numeric(14,2) check (approved_amount_mwk is null or approved_amount_mwk > 0),
  status text not null default 'pending' check (status in ('pending','approved','declined','cancelled','paid')),
  requested_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id) on delete set null,
  review_note text,
  paid_at timestamptz,
  payout_method text check (payout_method is null or payout_method in ('airtel_money','mpampa','bank')),
  payout_reference text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ticket_event_payout_requests_event_idx
  on public.ticket_event_payout_requests(event_id, requested_at desc);
create index if not exists ticket_event_payout_requests_organizer_idx
  on public.ticket_event_payout_requests(organizer_id, requested_at desc);
create index if not exists ticket_event_payout_requests_status_idx
  on public.ticket_event_payout_requests(status, requested_at asc);
create unique index if not exists ticket_event_payout_requests_one_open_idx
  on public.ticket_event_payout_requests(event_id)
  where status in ('pending','approved');

alter table public.ticket_event_finance_controls enable row level security;
alter table public.ticket_event_finance_control_log enable row level security;
alter table public.ticket_event_payout_requests enable row level security;

revoke all on public.ticket_event_finance_controls from public, anon, authenticated;
revoke all on public.ticket_event_finance_control_log from public, anon, authenticated;
revoke all on public.ticket_event_payout_requests from public, anon, authenticated;
grant all on public.ticket_event_finance_controls to service_role;
grant all on public.ticket_event_finance_control_log to service_role;
grant all on public.ticket_event_payout_requests to service_role;

create or replace function public.ticket_event_finance_snapshot(p_event_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_event public.ticket_events%rowtype;
  v_controls public.ticket_event_finance_controls%rowtype;
  v_has_controls boolean := false;
  v_gross_sales numeric(14,2) := 0;
  v_active_paid_sales numeric(14,2) := 0;
  v_refunded_sales numeric(14,2) := 0;
  v_service_fees_paid numeric(14,2) := 0;
  v_paid_out numeric(14,2) := 0;
  v_approved_unpaid numeric(14,2) := 0;
  v_available numeric(14,2) := 0;
  v_finished boolean := false;
  v_final_ready boolean := false;
begin
  select * into v_event from public.ticket_events where id = p_event_id;
  if not found then raise exception 'Event not found.'; end if;

  select * into v_controls from public.ticket_event_finance_controls where event_id = p_event_id;
  v_has_controls := found;

  select
    coalesce(sum(case when payment_status in ('paid','refunded') then unit_price_mwk * quantity else 0 end),0),
    coalesce(sum(case when payment_status = 'paid' then unit_price_mwk * quantity else 0 end),0),
    coalesce(sum(case when payment_status = 'refunded' then unit_price_mwk * quantity else 0 end),0),
    coalesce(sum(case when payment_status = 'paid' then service_fee_mwk else 0 end),0)
  into v_gross_sales, v_active_paid_sales, v_refunded_sales, v_service_fees_paid
  from public.ticket_orders
  where event_id = p_event_id;

  select
    coalesce(sum(case when status='paid' then approved_amount_mwk else 0 end),0),
    coalesce(sum(case when status='approved' then approved_amount_mwk else 0 end),0)
  into v_paid_out, v_approved_unpaid
  from public.ticket_event_payout_requests
  where event_id = p_event_id;

  v_finished := coalesce(v_event.ends_at, v_event.starts_at) is not null
    and coalesce(v_event.ends_at, v_event.starts_at) <= now();

  if v_has_controls and v_controls.status = 'open' then
    v_available := greatest(
      v_active_paid_sales
      - v_controls.platform_fee_mwk
      - v_controls.reserve_required_mwk
      - v_controls.other_hold_mwk
      - v_paid_out
      - v_approved_unpaid,
      0
    );
  else
    v_available := 0;
  end if;

  v_final_ready := v_has_controls
    and v_controls.status = 'open'
    and v_finished
    and v_event.status in ('published','paused','archived')
    and v_controls.reserve_required_mwk = 0
    and v_controls.other_hold_mwk = 0;

  return jsonb_build_object(
    'event_id', v_event.id,
    'event_title', v_event.title,
    'event_status', v_event.status,
    'organizer_id', v_event.organizer_id,
    'starts_at', v_event.starts_at,
    'ends_at', v_event.ends_at,
    'event_finished', v_finished,
    'payouts_configured', v_has_controls,
    'finance_status', case when v_has_controls then v_controls.status else 'unconfigured' end,
    'gross_ticket_sales_mwk', v_gross_sales,
    'active_paid_ticket_sales_mwk', v_active_paid_sales,
    'refunded_ticket_sales_mwk', v_refunded_sales,
    'service_fees_paid_mwk', v_service_fees_paid,
    'platform_fee_mwk', case when v_has_controls then v_controls.platform_fee_mwk else 0 end,
    'protected_refund_reserve_mwk', case when v_has_controls then v_controls.reserve_required_mwk else 0 end,
    'other_hold_mwk', case when v_has_controls then v_controls.other_hold_mwk else 0 end,
    'paid_out_mwk', v_paid_out,
    'approved_unpaid_mwk', v_approved_unpaid,
    'available_for_payout_mwk', v_available,
    'final_settlement_ready', v_final_ready
  );
end;
$$;

revoke all on function public.ticket_event_finance_snapshot(uuid) from public, anon, authenticated;
grant execute on function public.ticket_event_finance_snapshot(uuid) to service_role;

create or replace function public.get_my_ticket_event_finance(p_event_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_event public.ticket_events%rowtype;
  v_snapshot jsonb;
  v_requests jsonb;
begin
  if v_user is null then raise exception 'Authentication required.'; end if;
  if public.current_ticket_organizer_grant(v_user) is null then
    raise exception 'Temporary Organizer Workspace access is expired or revoked.';
  end if;

  select * into v_event
  from public.ticket_events
  where id = p_event_id and organizer_id = v_user;
  if not found then raise exception 'Organizer event not found.'; end if;

  v_snapshot := public.ticket_event_finance_snapshot(p_event_id);

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', r.id,
    'request_type', r.request_type,
    'requested_amount_mwk', r.requested_amount_mwk,
    'approved_amount_mwk', r.approved_amount_mwk,
    'status', r.status,
    'requested_at', r.requested_at,
    'reviewed_at', r.reviewed_at,
    'review_note', r.review_note,
    'paid_at', r.paid_at,
    'payout_method', r.payout_method,
    'payout_reference', r.payout_reference
  ) order by r.requested_at desc), '[]'::jsonb)
  into v_requests
  from public.ticket_event_payout_requests r
  where r.event_id = p_event_id and r.organizer_id = v_user;

  return v_snapshot || jsonb_build_object('requests', v_requests);
end;
$$;

create or replace function public.request_my_ticket_event_payout(
  p_event_id uuid,
  p_request_type text,
  p_requested_amount_mwk numeric default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_event public.ticket_events%rowtype;
  v_controls public.ticket_event_finance_controls%rowtype;
  v_type text := lower(trim(coalesce(p_request_type,'')));
  v_snapshot jsonb;
  v_available numeric(14,2);
  v_amount numeric(14,2);
  v_request public.ticket_event_payout_requests%rowtype;
begin
  if v_user is null then raise exception 'Authentication required.'; end if;
  if public.current_ticket_organizer_grant(v_user) is null then
    raise exception 'Temporary Organizer Workspace access is expired or revoked.';
  end if;

  select * into v_event from public.ticket_events where id = p_event_id for update;
  if not found or v_event.organizer_id is distinct from v_user then
    raise exception 'Organizer event not found.';
  end if;

  select * into v_controls from public.ticket_event_finance_controls where event_id = p_event_id for update;
  if not found then raise exception 'EYA has not configured payout controls for this event yet.'; end if;
  if v_controls.status <> 'open' then raise exception 'Payouts for this event are currently %.', v_controls.status; end if;

  if exists (
    select 1 from public.ticket_event_payout_requests
    where event_id = p_event_id and status in ('pending','approved')
  ) then
    raise exception 'This event already has an open payout request.';
  end if;

  v_snapshot := public.ticket_event_finance_snapshot(p_event_id);
  v_available := coalesce((v_snapshot->>'available_for_payout_mwk')::numeric,0);
  if v_available <= 0 then raise exception 'No event funds are currently available for payout.'; end if;

  if v_type = 'early_payout' then
    if v_event.status <> 'published' then raise exception 'Early payout is available only while the event is published.'; end if;
    if coalesce((v_snapshot->>'event_finished')::boolean,false) then
      raise exception 'This event has finished. Request final settlement instead.';
    end if;
    if p_requested_amount_mwk is null or p_requested_amount_mwk <= 0 or p_requested_amount_mwk <> trunc(p_requested_amount_mwk) then
      raise exception 'Enter a whole-MWK early payout amount greater than zero.';
    end if;
    if p_requested_amount_mwk > v_available then
      raise exception 'Requested amount exceeds the currently eligible early payout amount.';
    end if;
    v_amount := p_requested_amount_mwk;
  elsif v_type = 'final_settlement' then
    if not coalesce((v_snapshot->>'event_finished')::boolean,false) then
      raise exception 'Final settlement is available only after the event has finished.';
    end if;
    if not coalesce((v_snapshot->>'final_settlement_ready')::boolean,false) then
      raise exception 'Final settlement is not ready. EYA must clear the refund reserve and any manual hold first.';
    end if;
    v_amount := trunc(v_available);
    if v_amount <= 0 then raise exception 'No funds remain for final settlement.'; end if;
  else
    raise exception 'request_type must be early_payout or final_settlement.';
  end if;

  insert into public.ticket_event_payout_requests(
    event_id, organizer_id, request_type, requested_amount_mwk, metadata
  ) values (
    p_event_id, v_user, v_type, v_amount,
    jsonb_build_object('finance_snapshot_at_request', v_snapshot)
  ) returning * into v_request;

  return jsonb_build_object(
    'ok', true,
    'request_id', v_request.id,
    'request_type', v_request.request_type,
    'requested_amount_mwk', v_request.requested_amount_mwk,
    'status', v_request.status
  );
end;
$$;

create or replace function public.cancel_my_ticket_event_payout_request(p_request_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_request public.ticket_event_payout_requests%rowtype;
begin
  if v_user is null then raise exception 'Authentication required.'; end if;
  if public.current_ticket_organizer_grant(v_user) is null then
    raise exception 'Temporary Organizer Workspace access is expired or revoked.';
  end if;

  select * into v_request
  from public.ticket_event_payout_requests
  where id = p_request_id and organizer_id = v_user
  for update;
  if not found then raise exception 'Payout request not found.'; end if;
  if v_request.status <> 'pending' then raise exception 'Only a pending payout request can be cancelled.'; end if;

  update public.ticket_event_payout_requests
  set status='cancelled', updated_at=now()
  where id=p_request_id;

  return jsonb_build_object('ok',true,'request_id',p_request_id,'status','cancelled');
end;
$$;

create or replace function public.admin_set_ticket_event_finance_controls(
  p_event_id uuid,
  p_reserve_required_mwk numeric,
  p_platform_fee_mwk numeric,
  p_other_hold_mwk numeric default 0,
  p_status text default 'open',
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_admin uuid := auth.uid();
  v_event public.ticket_events%rowtype;
  v_existing public.ticket_event_finance_controls%rowtype;
  v_previous jsonb;
  v_new public.ticket_event_finance_controls%rowtype;
  v_status text := lower(trim(coalesce(p_status,'open')));
begin
  if v_admin is null or not public.is_admin() then raise exception 'Admin access required.'; end if;

  select * into v_event from public.ticket_events where id=p_event_id;
  if not found or v_event.organizer_id is null then raise exception 'Organizer-owned event not found.'; end if;

  if p_reserve_required_mwk is null or p_reserve_required_mwk < 0 or p_reserve_required_mwk <> trunc(p_reserve_required_mwk)
     or p_platform_fee_mwk is null or p_platform_fee_mwk < 0 or p_platform_fee_mwk <> trunc(p_platform_fee_mwk)
     or p_other_hold_mwk is null or p_other_hold_mwk < 0 or p_other_hold_mwk <> trunc(p_other_hold_mwk) then
    raise exception 'Finance control amounts must be whole-MWK values of zero or more.';
  end if;
  if v_status not in ('open','frozen','settled') then raise exception 'Finance status must be open, frozen, or settled.'; end if;

  select * into v_existing from public.ticket_event_finance_controls where event_id=p_event_id for update;
  if found then v_previous := to_jsonb(v_existing); else v_previous := null; end if;

  insert into public.ticket_event_finance_controls(
    event_id, organizer_id, reserve_required_mwk, platform_fee_mwk, other_hold_mwk,
    status, admin_note, updated_by, updated_at
  ) values (
    p_event_id, v_event.organizer_id, p_reserve_required_mwk, p_platform_fee_mwk, p_other_hold_mwk,
    v_status, nullif(trim(p_note),''), v_admin, now()
  )
  on conflict (event_id) do update set
    organizer_id=excluded.organizer_id,
    reserve_required_mwk=excluded.reserve_required_mwk,
    platform_fee_mwk=excluded.platform_fee_mwk,
    other_hold_mwk=excluded.other_hold_mwk,
    status=excluded.status,
    admin_note=excluded.admin_note,
    updated_by=excluded.updated_by,
    updated_at=now()
  returning * into v_new;

  insert into public.ticket_event_finance_control_log(event_id,actor_id,action,previous_state,new_state,note)
  values (p_event_id,v_admin,case when v_previous is null then 'configured' else 'updated' end,v_previous,to_jsonb(v_new),nullif(trim(p_note),''));

  return public.ticket_event_finance_snapshot(p_event_id);
end;
$$;

create or replace function public.admin_list_ticket_event_payout_requests()
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_admin uuid := auth.uid();
  v_result jsonb;
begin
  if v_admin is null or not public.is_admin() then raise exception 'Admin access required.'; end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', r.id,
    'event_id', r.event_id,
    'event_title', e.title,
    'organizer_id', r.organizer_id,
    'organizer_name', p.full_name,
    'organizer_email', p.email,
    'request_type', r.request_type,
    'requested_amount_mwk', r.requested_amount_mwk,
    'approved_amount_mwk', r.approved_amount_mwk,
    'status', r.status,
    'requested_at', r.requested_at,
    'reviewed_at', r.reviewed_at,
    'review_note', r.review_note,
    'paid_at', r.paid_at,
    'payout_method', r.payout_method,
    'payout_reference', r.payout_reference,
    'finance', public.ticket_event_finance_snapshot(r.event_id)
  ) order by r.requested_at asc), '[]'::jsonb)
  into v_result
  from public.ticket_event_payout_requests r
  join public.ticket_events e on e.id=r.event_id
  left join public.profiles p on p.id=r.organizer_id
  where r.status in ('pending','approved');

  return v_result;
end;
$$;

create or replace function public.admin_review_ticket_event_payout_request(
  p_request_id uuid,
  p_action text,
  p_approved_amount_mwk numeric default null,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_admin uuid := auth.uid();
  v_request public.ticket_event_payout_requests%rowtype;
  v_controls public.ticket_event_finance_controls%rowtype;
  v_snapshot jsonb;
  v_available numeric(14,2);
  v_action text := lower(trim(coalesce(p_action,'')));
  v_approved numeric(14,2);
begin
  if v_admin is null or not public.is_admin() then raise exception 'Admin access required.'; end if;

  select * into v_request from public.ticket_event_payout_requests where id=p_request_id for update;
  if not found then raise exception 'Payout request not found.'; end if;
  if v_request.status <> 'pending' then raise exception 'Only pending payout requests can be reviewed.'; end if;

  if v_action = 'decline' then
    if nullif(trim(p_note),'') is null then raise exception 'A decline note is required.'; end if;
    update public.ticket_event_payout_requests
    set status='declined', reviewed_at=now(), reviewed_by=v_admin, review_note=trim(p_note), updated_at=now()
    where id=p_request_id;
    return jsonb_build_object('ok',true,'request_id',p_request_id,'status','declined');
  elsif v_action <> 'approve' then
    raise exception 'action must be approve or decline.';
  end if;

  select * into v_controls from public.ticket_event_finance_controls where event_id=v_request.event_id for update;
  if not found or v_controls.status <> 'open' then raise exception 'Event payouts are not open for approval.'; end if;

  v_snapshot := public.ticket_event_finance_snapshot(v_request.event_id);
  v_available := coalesce((v_snapshot->>'available_for_payout_mwk')::numeric,0);
  if v_available <= 0 then raise exception 'No event funds are currently available for payout.'; end if;

  if v_request.request_type = 'final_settlement' and not coalesce((v_snapshot->>'final_settlement_ready')::boolean,false) then
    raise exception 'Final settlement is not ready. Clear the refund reserve and any manual hold first.';
  end if;

  if p_approved_amount_mwk is null then
    v_approved := least(v_request.requested_amount_mwk, v_available);
  else
    if p_approved_amount_mwk <= 0 or p_approved_amount_mwk <> trunc(p_approved_amount_mwk) then
      raise exception 'Approved amount must be a whole-MWK value greater than zero.';
    end if;
    v_approved := p_approved_amount_mwk;
  end if;

  if v_approved > v_request.requested_amount_mwk then raise exception 'Approved amount cannot exceed the organizer request.'; end if;
  if v_approved > v_available then raise exception 'Approved amount exceeds currently available event funds.'; end if;

  update public.ticket_event_payout_requests
  set status='approved', approved_amount_mwk=v_approved, reviewed_at=now(), reviewed_by=v_admin,
      review_note=nullif(trim(p_note),''), metadata=metadata || jsonb_build_object('finance_snapshot_at_approval',v_snapshot), updated_at=now()
  where id=p_request_id;

  return jsonb_build_object('ok',true,'request_id',p_request_id,'status','approved','approved_amount_mwk',v_approved);
end;
$$;

create or replace function public.admin_record_ticket_event_payout_paid(
  p_request_id uuid,
  p_payout_method text,
  p_payout_reference text
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_admin uuid := auth.uid();
  v_request public.ticket_event_payout_requests%rowtype;
  v_method text := lower(trim(coalesce(p_payout_method,'')));
  v_snapshot jsonb;
  v_remaining numeric(14,2);
  v_controls public.ticket_event_finance_controls%rowtype;
begin
  if v_admin is null or not public.is_admin() then raise exception 'Admin access required.'; end if;
  if v_method not in ('airtel_money','mpampa','bank') then raise exception 'Unsupported payout method.'; end if;
  if nullif(trim(p_payout_reference),'') is null then raise exception 'A payout provider reference is required.'; end if;

  select * into v_request from public.ticket_event_payout_requests where id=p_request_id for update;
  if not found then raise exception 'Payout request not found.'; end if;
  if v_request.status <> 'approved' or v_request.approved_amount_mwk is null then
    raise exception 'Only an approved payout can be recorded as paid.';
  end if;

  update public.ticket_event_payout_requests
  set status='paid', paid_at=now(), payout_method=v_method, payout_reference=trim(p_payout_reference), updated_at=now()
  where id=p_request_id;

  v_snapshot := public.ticket_event_finance_snapshot(v_request.event_id);
  v_remaining := coalesce((v_snapshot->>'available_for_payout_mwk')::numeric,0);

  if v_request.request_type='final_settlement'
     and coalesce((v_snapshot->>'event_finished')::boolean,false)
     and v_remaining <= 0 then
    select * into v_controls from public.ticket_event_finance_controls where event_id=v_request.event_id for update;
    if found and v_controls.reserve_required_mwk=0 and v_controls.other_hold_mwk=0 then
      update public.ticket_event_finance_controls
      set status='settled', updated_by=v_admin, updated_at=now()
      where event_id=v_request.event_id;
      insert into public.ticket_event_finance_control_log(event_id,actor_id,action,previous_state,new_state,note)
      values (
        v_request.event_id,
        v_admin,
        'final_settlement_paid',
        to_jsonb(v_controls),
        to_jsonb((select c from public.ticket_event_finance_controls c where c.event_id=v_request.event_id)),
        'Final settlement payout recorded as paid.'
      );
    end if;
  end if;

  return jsonb_build_object('ok',true,'request_id',p_request_id,'status','paid','finance',public.ticket_event_finance_snapshot(v_request.event_id));
end;
$$;

revoke all on function public.get_my_ticket_event_finance(uuid) from public, anon;
revoke all on function public.request_my_ticket_event_payout(uuid,text,numeric) from public, anon;
revoke all on function public.cancel_my_ticket_event_payout_request(uuid) from public, anon;
revoke all on function public.admin_set_ticket_event_finance_controls(uuid,numeric,numeric,numeric,text,text) from public, anon;
revoke all on function public.admin_list_ticket_event_payout_requests() from public, anon;
revoke all on function public.admin_review_ticket_event_payout_request(uuid,text,numeric,text) from public, anon;
revoke all on function public.admin_record_ticket_event_payout_paid(uuid,text,text) from public, anon;

grant execute on function public.get_my_ticket_event_finance(uuid) to authenticated;
grant execute on function public.request_my_ticket_event_payout(uuid,text,numeric) to authenticated;
grant execute on function public.cancel_my_ticket_event_payout_request(uuid) to authenticated;
grant execute on function public.admin_set_ticket_event_finance_controls(uuid,numeric,numeric,numeric,text,text) to authenticated;
grant execute on function public.admin_list_ticket_event_payout_requests() to authenticated;
grant execute on function public.admin_review_ticket_event_payout_request(uuid,text,numeric,text) to authenticated;
grant execute on function public.admin_record_ticket_event_payout_paid(uuid,text,text) to authenticated;
