create table if not exists public.ticket_event_approval_versions (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.ticket_events(id) on delete cascade,
  version_number integer not null check (version_number >= 1),
  approved_by uuid references auth.users(id) on delete set null,
  approved_at timestamptz not null default now(),
  event_snapshot jsonb not null,
  tiers_snapshot jsonb not null,
  approval_hash text not null,
  review_note text,
  created_at timestamptz not null default now(),
  unique(event_id, version_number)
);

create index if not exists ticket_event_approval_versions_event_idx
  on public.ticket_event_approval_versions(event_id, version_number desc);
create index if not exists ticket_event_approval_versions_hash_idx
  on public.ticket_event_approval_versions(approval_hash);

alter table public.ticket_event_approval_versions enable row level security;
revoke all on table public.ticket_event_approval_versions from anon, authenticated;
grant select on table public.ticket_event_approval_versions to authenticated;
grant all on table public.ticket_event_approval_versions to service_role;

drop policy if exists ticket_event_approval_versions_read_owner_admin on public.ticket_event_approval_versions;
create policy ticket_event_approval_versions_read_owner_admin
on public.ticket_event_approval_versions
for select
to authenticated
using (
  public.is_admin()
  or exists (
    select 1 from public.ticket_events e
    where e.id = ticket_event_approval_versions.event_id
      and e.organizer_id = auth.uid()
  )
);

alter table public.ticket_events
  add column if not exists approved_version_id uuid,
  add column if not exists approved_version_number integer;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'ticket_events_approved_version_id_fkey'
      and conrelid = 'public.ticket_events'::regclass
  ) then
    alter table public.ticket_events
      add constraint ticket_events_approved_version_id_fkey
      foreign key (approved_version_id)
      references public.ticket_event_approval_versions(id)
      on delete restrict;
  end if;
end $$;

create or replace function public.ticket_event_material_snapshot(p_event_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, extensions, pg_temp
as $function$
declare
  v_event public.ticket_events%rowtype;
  v_tiers jsonb;
begin
  select * into v_event
  from public.ticket_events
  where id = p_event_id;
  if not found then
    raise exception 'Event not found.';
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', t.id,
        'name', t.name,
        'description', t.description,
        'price_mwk', t.price_mwk,
        'capacity_total', t.capacity_total,
        'available', t.available,
        'sale_starts_at', t.sale_starts_at,
        'sale_ends_at', t.sale_ends_at,
        'sort_order', t.sort_order,
        'metadata', t.metadata
      ) order by t.sort_order, t.created_at, t.id
    ),
    '[]'::jsonb
  ) into v_tiers
  from public.ticket_tiers t
  where t.event_id = p_event_id;

  return jsonb_build_object(
    'event', jsonb_build_object(
      'id', v_event.id,
      'title', v_event.title,
      'category', v_event.category,
      'description', v_event.description,
      'date_label', v_event.date_label,
      'starts_at', v_event.starts_at,
      'ends_at', v_event.ends_at,
      'venue', v_event.venue,
      'city', v_event.city,
      'image_url', v_event.image_url,
      'hero_image_url', v_event.hero_image_url,
      'sort_order', v_event.sort_order,
      'metadata', v_event.metadata
    ),
    'tiers', v_tiers
  );
end;
$function$;

create or replace function public.ticket_event_material_hash(p_event_id uuid)
returns text
language sql
stable
security definer
set search_path = public, auth, extensions, pg_temp
as $function$
  select encode(
    extensions.digest(
      convert_to(public.ticket_event_material_snapshot(p_event_id)::text, 'UTF8'),
      'sha256'
    ),
    'hex'
  );
$function$;

create or replace function public.ticket_event_approval_version_matches(p_event_id uuid, p_version_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, auth, extensions, pg_temp
as $function$
  select exists (
    select 1
    from public.ticket_event_approval_versions v
    where v.id = p_version_id
      and v.event_id = p_event_id
      and v.approval_hash = public.ticket_event_material_hash(p_event_id)
  );
$function$;

create or replace function public.ticket_event_current_approval_matches(p_event_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public, auth, extensions, pg_temp
as $function$
declare
  v_event public.ticket_events%rowtype;
begin
  select * into v_event
  from public.ticket_events
  where id = p_event_id;
  if not found then return false; end if;
  if v_event.organizer_id is null then return true; end if;
  if v_event.approved_version_id is null then return false; end if;
  return public.ticket_event_approval_version_matches(v_event.id, v_event.approved_version_id);
end;
$function$;

revoke all on function public.ticket_event_material_snapshot(uuid) from public, anon, authenticated;
revoke all on function public.ticket_event_material_hash(uuid) from public, anon, authenticated;
revoke all on function public.ticket_event_approval_version_matches(uuid, uuid) from public, anon, authenticated;
revoke all on function public.ticket_event_current_approval_matches(uuid) from public, anon, authenticated;
grant execute on function public.ticket_event_material_snapshot(uuid) to service_role;
grant execute on function public.ticket_event_material_hash(uuid) to service_role;
grant execute on function public.ticket_event_approval_version_matches(uuid, uuid) to service_role;
grant execute on function public.ticket_event_current_approval_matches(uuid) to service_role;

create or replace function public.protect_approved_ticket_event_material()
returns trigger
language plpgsql
set search_path = public, auth, pg_temp
as $function$
begin
  if old.organizer_id is null or old.approved_version_id is null then
    return new;
  end if;

  if old.approved_version_id is distinct from new.approved_version_id
     or old.approved_version_number is distinct from new.approved_version_number then
    raise exception 'Approved organizer event version cannot be changed directly. Use EYA review.';
  end if;

  if old.title is distinct from new.title
     or old.category is distinct from new.category
     or old.description is distinct from new.description
     or old.date_label is distinct from new.date_label
     or old.starts_at is distinct from new.starts_at
     or old.ends_at is distinct from new.ends_at
     or old.venue is distinct from new.venue
     or old.city is distinct from new.city
     or old.image_url is distinct from new.image_url
     or old.hero_image_url is distinct from new.hero_image_url
     or old.sort_order is distinct from new.sort_order
     or old.metadata is distinct from new.metadata then
    raise exception 'Approved organizer event details are locked. Material changes require a new EYA review version.';
  end if;

  return new;
end;
$function$;

drop trigger if exists protect_approved_ticket_event_material_trigger on public.ticket_events;
create trigger protect_approved_ticket_event_material_trigger
before update on public.ticket_events
for each row execute function public.protect_approved_ticket_event_material();

create or replace function public.protect_approved_ticket_tier_material()
returns trigger
language plpgsql
set search_path = public, auth, pg_temp
as $function$
declare
  v_event public.ticket_events%rowtype;
  v_event_id uuid;
begin
  v_event_id := case when tg_op = 'DELETE' then old.event_id else new.event_id end;
  select * into v_event from public.ticket_events where id = v_event_id;

  if not found or v_event.organizer_id is null or v_event.approved_version_id is null then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  if tg_op = 'INSERT' then
    raise exception 'Approved organizer ticket types are locked. Adding a ticket type requires a new EYA review version.';
  elsif tg_op = 'DELETE' then
    raise exception 'Approved organizer ticket types are locked. Removing a ticket type requires a new EYA review version.';
  end if;

  if old.event_id is distinct from new.event_id
     or old.name is distinct from new.name
     or old.description is distinct from new.description
     or old.price_mwk is distinct from new.price_mwk
     or old.capacity_total is distinct from new.capacity_total
     or old.available is distinct from new.available
     or old.sale_starts_at is distinct from new.sale_starts_at
     or old.sale_ends_at is distinct from new.sale_ends_at
     or old.sort_order is distinct from new.sort_order
     or old.metadata is distinct from new.metadata then
    raise exception 'Approved ticket price, capacity, availability, sale dates and tier details are locked. Material changes require EYA review.';
  end if;

  return new;
end;
$function$;

drop trigger if exists protect_approved_ticket_tier_material_trigger on public.ticket_tiers;
create trigger protect_approved_ticket_tier_material_trigger
before insert or update or delete on public.ticket_tiers
for each row execute function public.protect_approved_ticket_tier_material();

create or replace function public.require_organizer_approval_before_publish()
returns trigger
language plpgsql
set search_path = public, auth, pg_temp
as $function$
begin
  if new.organizer_id is not null
     and new.status = 'published'
     and old.status is distinct from 'published' then
    if new.approved_version_id is null
       or not public.ticket_event_approval_version_matches(new.id, new.approved_version_id) then
      raise exception 'Organizer event and ticket configuration must be approved by EYA before publication.';
    end if;
  end if;
  return new;
end;
$function$;

drop trigger if exists require_organizer_approval_before_publish_trigger on public.ticket_events;
create trigger require_organizer_approval_before_publish_trigger
before update of status on public.ticket_events
for each row execute function public.require_organizer_approval_before_publish();

create or replace function public.admin_review_ticket_event(p_event_id uuid, p_action text, p_note text default null)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, extensions, pg_temp
as $function$
declare
  v_admin uuid := auth.uid();
  v_event public.ticket_events%rowtype;
  v_action text := lower(trim(coalesce(p_action,'')));
  v_status text;
  v_grant_active boolean;
  v_tier_count integer;
  v_version_number integer;
  v_approval public.ticket_event_approval_versions%rowtype;
  v_snapshot jsonb;
  v_hash text;
begin
  if v_admin is null or not public.is_admin() then raise exception 'Admin access required.'; end if;
  select * into v_event from public.ticket_events where id = p_event_id for update;
  if not found then raise exception 'Event not found.'; end if;
  if v_event.status <> 'pending_review' then raise exception 'Only pending-review events can be reviewed.'; end if;

  if v_action = 'approve' then
    if v_event.organizer_id is null then
      raise exception 'Organizer review approval is only for organizer-owned events.';
    end if;

    select exists(
      select 1 from public.ticket_organizer_access_grants g
      where g.id=v_event.organizer_access_grant_id and g.user_id=v_event.organizer_id
        and g.status='active' and g.starts_at<=now() and g.expires_at>now()
    ) into v_grant_active;
    if not coalesce(v_grant_active,false) then
      raise exception 'This organizer access is expired or revoked. Renew it before publishing the event.';
    end if;

    if v_event.starts_at is null or v_event.starts_at <= now() then
      raise exception 'Event start time must be in the future before approval.';
    end if;
    if v_event.ends_at is not null and v_event.ends_at <= v_event.starts_at then
      raise exception 'Event end time must be after the start time.';
    end if;

    select count(*) into v_tier_count
    from public.ticket_tiers t
    where t.event_id = p_event_id
      and t.available = true
      and t.capacity_total > 0;
    if v_tier_count < 1 then
      raise exception 'At least one available ticket type must be approved with the event.';
    end if;

    if exists (
      select 1 from public.ticket_tiers t
      where t.event_id = p_event_id
        and (
          t.price_mwk < 0
          or t.capacity_total < 1
          or t.capacity_total < (t.capacity_sold + t.capacity_reserved)
          or (t.sale_starts_at is not null and t.sale_ends_at is not null and t.sale_ends_at <= t.sale_starts_at)
        )
    ) then
      raise exception 'One or more ticket types have invalid price, capacity, or sale dates.';
    end if;

    v_snapshot := public.ticket_event_material_snapshot(p_event_id);
    v_hash := encode(extensions.digest(convert_to(v_snapshot::text, 'UTF8'), 'sha256'), 'hex');
    select coalesce(max(version_number),0) + 1 into v_version_number
    from public.ticket_event_approval_versions
    where event_id = p_event_id;

    insert into public.ticket_event_approval_versions(
      event_id, version_number, approved_by, approved_at,
      event_snapshot, tiers_snapshot, approval_hash, review_note
    ) values (
      p_event_id, v_version_number, v_admin, now(),
      v_snapshot->'event', v_snapshot->'tiers', v_hash, nullif(trim(p_note),'')
    ) returning * into v_approval;

    v_status := 'published';
  elsif v_action = 'request_changes' then
    v_status := 'changes_requested';
    if nullif(trim(p_note), '') is null then raise exception 'A review note is required when requesting changes.'; end if;
  elsif v_action = 'reject' then
    v_status := 'rejected';
    if nullif(trim(p_note), '') is null then raise exception 'A review note is required when rejecting an event.'; end if;
  else
    raise exception 'Unsupported review action.';
  end if;

  update public.ticket_events set
    status=v_status,
    reviewed_at=now(),
    reviewed_by=v_admin,
    review_note=nullif(trim(p_note),''),
    published_at=case when v_status='published' then now() else published_at end,
    approved_version_id=case when v_status='published' then v_approval.id else approved_version_id end,
    approved_version_number=case when v_status='published' then v_approval.version_number else approved_version_number end,
    updated_at=now()
  where id=p_event_id;

  insert into public.ticket_event_review_log(event_id,actor_id,action,from_status,to_status,note)
  values (
    p_event_id,
    v_admin,
    case when v_action='approve' then 'approved' else v_action end,
    v_event.status,
    v_status,
    case
      when v_action='approve' then concat('Approved event + ticket configuration version ', v_approval.version_number, coalesce(': ' || nullif(trim(p_note),''), ''))
      else nullif(trim(p_note),'')
    end
  );

  return jsonb_build_object(
    'ok',true,
    'event_id',p_event_id,
    'status',v_status,
    'approved_version_id',case when v_status='published' then v_approval.id else null end,
    'approved_version_number',case when v_status='published' then v_approval.version_number else null end,
    'approval_hash',case when v_status='published' then v_approval.approval_hash else null end
  );
end;
$function$;

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
set search_path = public, auth, extensions, pg_temp
as $function$
declare
  v_event public.ticket_events%rowtype;
  v_tier public.ticket_tiers%rowtype;
  v_order public.ticket_orders%rowtype;
  v_item public.ticket_order_items%rowtype;
  v_available integer;
  v_service_fee numeric(12,2) := 0;
begin
  perform public.release_expired_ticket_reservations();

  if p_user_id is null then raise exception 'A user id is required.'; end if;
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

  if v_event.organizer_id is not null then
    if v_event.approved_version_id is null
       or not public.ticket_event_approval_version_matches(v_event.id, v_event.approved_version_id) then
      raise exception 'This organizer event is not currently approved for ticket sales.';
    end if;
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
    user_id,event_id,tier_id,quantity,unit_price_mwk,service_fee_mwk,total_mwk,
    status,payment_status,customer_email,customer_phone,reserved_until
  ) values (
    p_user_id,v_event.id,v_tier.id,p_quantity,v_tier.price_mwk,v_service_fee,
    (v_tier.price_mwk * p_quantity) + v_service_fee,
    'pending','unpaid',nullif(p_customer_email,''),nullif(p_customer_phone,''),
    now() + interval '15 minutes'
  ) returning * into v_order;

  insert into public.ticket_order_items (
    order_id,event_id,tier_id,event_title_snapshot,tier_name_snapshot,quantity,unit_price_mwk,line_total_mwk
  ) values (
    v_order.id,v_event.id,v_tier.id,v_event.title,v_tier.name,p_quantity,v_tier.price_mwk,v_tier.price_mwk*p_quantity
  ) returning * into v_item;

  return jsonb_build_object(
    'order',to_jsonb(v_order),
    'item',to_jsonb(v_item),
    'event',to_jsonb(v_event),
    'tier',to_jsonb(v_tier),
    'available_after_reservation',v_available-p_quantity
  );
end;
$function$;

drop policy if exists ticket_events_read_published_or_admin on public.ticket_events;
create policy ticket_events_read_published_or_admin
on public.ticket_events
for select
to anon, authenticated
using (
  public.is_admin()
  or (
    status = 'published'
    and (organizer_id is null or approved_version_id is not null)
  )
);

drop policy if exists ticket_tiers_read_published_or_admin on public.ticket_tiers;
create policy ticket_tiers_read_published_or_admin
on public.ticket_tiers
for select
to anon, authenticated
using (
  public.is_admin()
  or exists (
    select 1 from public.ticket_events e
    where e.id = ticket_tiers.event_id
      and e.status = 'published'
      and (e.organizer_id is null or e.approved_version_id is not null)
  )
);
