begin;

create or replace function public.check_in_ticket_entry_credential(
  p_credential text,
  p_event_id uuid default null,
  p_device_label text default null,
  p_method text default 'qr'
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_actor_id uuid := auth.uid();
  v_is_admin boolean := false;
  v_scanner_assignment_id uuid;
  v_gate_label text;
  v_scan_event public.ticket_events%rowtype;
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
  if v_actor_id is null then raise exception 'Authentication required.'; end if;
  v_is_admin := public.is_admin();

  if not v_is_admin then
    if p_event_id is null then raise exception 'Event context is required for Gate Staff check-in.'; end if;

    select * into v_scan_event
    from public.ticket_events
    where id=p_event_id
    for share;

    if not found then raise exception 'Event not found.'; end if;
    if v_scan_event.starts_at is null then raise exception 'Gate Staff scanning is not available for this event.'; end if;
    if v_scan_event.status<>'published' then raise exception 'Gate Staff scanning is not active for this event.'; end if;
    if v_scan_event.organizer_id is not null and v_scan_event.approved_version_id is null then
      raise exception 'Gate Staff scanning is not active for this event.';
    end if;
    if v_now < v_scan_event.starts_at-interval '48 hours' then raise exception 'Gate Staff scanning has not opened yet.'; end if;
    if v_now > coalesce(v_scan_event.ends_at,v_scan_event.starts_at+interval '6 hours')+interval '6 hours' then
      raise exception 'Gate Staff scanning has expired for this event.';
    end if;

    select a.id,a.gate_label
    into v_scanner_assignment_id,v_gate_label
    from public.ticket_gate_staff_assignments a
    where a.event_id=p_event_id
      and a.user_id=v_actor_id
      and a.status='accepted'
    limit 1
    for share;

    if v_scanner_assignment_id is null then raise exception 'Active Gate Staff access is required for this event.'; end if;
  end if;

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

  select * into v_ticket
  from public.issued_tickets
  where id=v_ticket_id
  for update;

  if not found then raise exception 'Ticket not found.'; end if;
  if p_event_id is not null and v_ticket.event_id<>p_event_id then raise exception 'Ticket is for another event.'; end if;
  if v_ticket.status<>'active' then raise exception 'Ticket is %.',v_ticket.status; end if;
  if v_ticket.checked_in_at is not null then raise exception 'Ticket has already been checked in.'; end if;

  if v_guest_pass_id is not null then
    select * into v_guest
    from public.ticket_guest_passes
    where id=v_guest_pass_id
    for update;

    if not found or v_guest.status<>'active' or v_guest.expires_at<=v_now then raise exception 'Guest pass is no longer active.'; end if;
  end if;

  update public.issued_tickets
  set status='used',checked_in_at=v_now,checked_in_by=v_actor_id,updated_at=v_now
  where id=v_ticket.id and status='active' and checked_in_at is null
  returning * into v_ticket;

  if not found then raise exception 'Ticket has already been checked in.'; end if;

  insert into public.ticket_checkins(
    issued_ticket_id,event_id,checked_in_by,method,device_label,metadata,
    scanner_assignment_id,gate_label
  ) values (
    v_ticket.id,v_ticket.event_id,v_actor_id,v_method,
    nullif(btrim(coalesce(p_device_label,'')),''),
    jsonb_build_object(
      'credential_kind',v_kind,
      'credential_version',case when v_kind in ('personal_live','guest_live') then 2 else 1 end,
      'credential_generation',v_generation,
      'guest_pass_id',v_guest_pass_id,
      'scanner_access_kind',case when v_is_admin then 'admin' else 'gate_staff' end
    ),
    v_scanner_assignment_id,
    v_gate_label
  ) returning * into v_checkin;

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

  return jsonb_build_object(
    'status','success',
    'credential_kind',v_kind,
    'scanner_access_kind',case when v_is_admin then 'admin' else 'gate_staff' end,
    'scanner_assignment_id',v_scanner_assignment_id,
    'gate_label',v_gate_label,
    'guest_pass',case when v_guest_pass_id is not null then jsonb_build_object('id',v_guest_pass_id,'guest_name',v_guest.guest_name,'mode',v_guest.mode) else null end,
    'ticket',to_jsonb(v_ticket)||jsonb_build_object('event',v_event,'tier',v_tier,'order',v_order,'user',v_user),
    'checkin',to_jsonb(v_checkin)
  );
end;
$$;

revoke all on function public.check_in_ticket_entry_credential(text,uuid,text,text) from public, anon;
grant execute on function public.check_in_ticket_entry_credential(text,uuid,text,text) to authenticated;

commit;
