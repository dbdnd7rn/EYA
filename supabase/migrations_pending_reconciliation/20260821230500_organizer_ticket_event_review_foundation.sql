alter table public.ticket_events
  add column if not exists submitted_at timestamptz,
  add column if not exists submitted_by uuid references auth.users(id) on delete set null,
  add column if not exists reviewed_at timestamptz,
  add column if not exists reviewed_by uuid references auth.users(id) on delete set null,
  add column if not exists review_note text,
  add column if not exists published_at timestamptz;

alter table public.ticket_events drop constraint if exists ticket_events_status_check;
alter table public.ticket_events add constraint ticket_events_status_check check (
  status = any (array[
    'draft'::text,
    'pending_review'::text,
    'changes_requested'::text,
    'rejected'::text,
    'published'::text,
    'paused'::text,
    'cancelled'::text,
    'archived'::text
  ])
);

create index if not exists ticket_events_organizer_status_idx
  on public.ticket_events (organizer_id, status, updated_at desc);

create table if not exists public.ticket_event_review_log (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.ticket_events(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete set null,
  action text not null check (action = any (array[
    'created'::text,
    'edited'::text,
    'submitted'::text,
    'approved'::text,
    'changes_requested'::text,
    'rejected'::text,
    'published'::text,
    'paused'::text,
    'cancelled'::text,
    'archived'::text
  ])),
  from_status text,
  to_status text,
  note text,
  created_at timestamptz not null default now()
);

create index if not exists ticket_event_review_log_event_created_idx
  on public.ticket_event_review_log (event_id, created_at desc);

alter table public.ticket_event_review_log enable row level security;
revoke all on public.ticket_event_review_log from public, anon, authenticated;
grant select on public.ticket_event_review_log to authenticated;

drop policy if exists ticket_event_review_log_read_organizer_or_admin on public.ticket_event_review_log;
create policy ticket_event_review_log_read_organizer_or_admin
on public.ticket_event_review_log
for select
to authenticated
using (
  public.is_admin()
  or exists (
    select 1
    from public.ticket_events e
    where e.id = ticket_event_review_log.event_id
      and e.organizer_id = auth.uid()
  )
);

create or replace function public.create_my_ticket_event_draft(
  p_title text,
  p_category text,
  p_description text,
  p_date_label text,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_venue text,
  p_city text,
  p_image_url text,
  p_hero_image_url text
) returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_user uuid := auth.uid();
  v_event public.ticket_events%rowtype;
begin
  if v_user is null then raise exception 'Authentication required.'; end if;
  if nullif(trim(p_title), '') is null then raise exception 'Event title is required.'; end if;
  if nullif(trim(p_date_label), '') is null then raise exception 'Event date label is required.'; end if;
  if nullif(trim(p_venue), '') is null then raise exception 'Venue is required.'; end if;
  if nullif(trim(p_city), '') is null then raise exception 'City is required.'; end if;
  if nullif(trim(p_image_url), '') is null or nullif(trim(p_hero_image_url), '') is null then raise exception 'Card and hero images are required.'; end if;
  if p_ends_at is not null and p_starts_at is not null and p_ends_at <= p_starts_at then raise exception 'Event end time must be after the start time.'; end if;

  insert into public.ticket_events (
    title, category, description, date_label, starts_at, ends_at, venue, city,
    image_url, hero_image_url, status, organizer_id, created_by
  ) values (
    trim(p_title), coalesce(nullif(trim(p_category), ''), 'Music'), nullif(trim(p_description), ''),
    trim(p_date_label), p_starts_at, p_ends_at, trim(p_venue), trim(p_city),
    trim(p_image_url), trim(p_hero_image_url), 'draft', v_user, v_user
  ) returning * into v_event;

  insert into public.ticket_event_review_log(event_id, actor_id, action, from_status, to_status)
  values (v_event.id, v_user, 'created', null, 'draft');

  return jsonb_build_object('ok', true, 'event_id', v_event.id, 'status', v_event.status);
end;
$$;

create or replace function public.update_my_ticket_event_draft(
  p_event_id uuid,
  p_title text,
  p_category text,
  p_description text,
  p_date_label text,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_venue text,
  p_city text,
  p_image_url text,
  p_hero_image_url text
) returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_user uuid := auth.uid();
  v_event public.ticket_events%rowtype;
  v_from text;
begin
  if v_user is null then raise exception 'Authentication required.'; end if;
  select * into v_event from public.ticket_events where id = p_event_id for update;
  if not found then raise exception 'Event not found.'; end if;
  if v_event.organizer_id is distinct from v_user then raise exception 'Organizer access required.'; end if;
  if v_event.status not in ('draft','changes_requested') then raise exception 'This event cannot be edited in its current status.'; end if;
  if nullif(trim(p_title), '') is null or nullif(trim(p_date_label), '') is null or nullif(trim(p_venue), '') is null or nullif(trim(p_city), '') is null then raise exception 'Title, date, venue, and city are required.'; end if;
  if nullif(trim(p_image_url), '') is null or nullif(trim(p_hero_image_url), '') is null then raise exception 'Card and hero images are required.'; end if;
  if p_ends_at is not null and p_starts_at is not null and p_ends_at <= p_starts_at then raise exception 'Event end time must be after the start time.'; end if;

  v_from := v_event.status;
  update public.ticket_events set
    title = trim(p_title), category = coalesce(nullif(trim(p_category), ''), 'Music'), description = nullif(trim(p_description), ''),
    date_label = trim(p_date_label), starts_at = p_starts_at, ends_at = p_ends_at, venue = trim(p_venue), city = trim(p_city),
    image_url = trim(p_image_url), hero_image_url = trim(p_hero_image_url), status = 'draft', review_note = null, updated_at = now()
  where id = p_event_id;

  insert into public.ticket_event_review_log(event_id, actor_id, action, from_status, to_status)
  values (p_event_id, v_user, 'edited', v_from, 'draft');

  return jsonb_build_object('ok', true, 'event_id', p_event_id, 'status', 'draft');
end;
$$;

create or replace function public.upsert_my_ticket_tier(
  p_event_id uuid,
  p_tier_id uuid,
  p_name text,
  p_description text,
  p_price_mwk numeric,
  p_capacity_total integer,
  p_available boolean default true,
  p_sale_starts_at timestamptz default null,
  p_sale_ends_at timestamptz default null,
  p_sort_order integer default 100
) returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_user uuid := auth.uid();
  v_event public.ticket_events%rowtype;
  v_tier public.ticket_tiers%rowtype;
begin
  if v_user is null then raise exception 'Authentication required.'; end if;
  select * into v_event from public.ticket_events where id = p_event_id for update;
  if not found then raise exception 'Event not found.'; end if;
  if v_event.organizer_id is distinct from v_user then raise exception 'Organizer access required.'; end if;
  if v_event.status not in ('draft','changes_requested') then raise exception 'Ticket types cannot be edited in this event status.'; end if;
  if nullif(trim(p_name), '') is null then raise exception 'Ticket name is required.'; end if;
  if coalesce(p_price_mwk, -1) < 0 then raise exception 'Ticket price cannot be negative.'; end if;
  if coalesce(p_capacity_total, 0) < 1 then raise exception 'Ticket capacity must be at least 1.'; end if;
  if p_sale_ends_at is not null and p_sale_starts_at is not null and p_sale_ends_at <= p_sale_starts_at then raise exception 'Ticket sale end must be after sale start.'; end if;

  if p_tier_id is null then
    insert into public.ticket_tiers(event_id,name,description,price_mwk,capacity_total,available,sale_starts_at,sale_ends_at,sort_order)
    values (p_event_id,trim(p_name),coalesce(trim(p_description),''),p_price_mwk,p_capacity_total,coalesce(p_available,true),p_sale_starts_at,p_sale_ends_at,coalesce(p_sort_order,100))
    returning * into v_tier;
  else
    select * into v_tier from public.ticket_tiers where id = p_tier_id and event_id = p_event_id for update;
    if not found then raise exception 'Ticket type not found.'; end if;
    if p_capacity_total < (v_tier.capacity_sold + v_tier.capacity_reserved) then raise exception 'Capacity cannot be lower than tickets already sold or reserved.'; end if;
    update public.ticket_tiers set
      name = trim(p_name), description = coalesce(trim(p_description),''), price_mwk = p_price_mwk,
      capacity_total = p_capacity_total, available = coalesce(p_available,true), sale_starts_at = p_sale_starts_at,
      sale_ends_at = p_sale_ends_at, sort_order = coalesce(p_sort_order,100), updated_at = now()
    where id = p_tier_id returning * into v_tier;
  end if;

  return jsonb_build_object('ok', true, 'tier_id', v_tier.id, 'event_id', p_event_id);
end;
$$;

create or replace function public.submit_my_ticket_event(p_event_id uuid) returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_user uuid := auth.uid();
  v_event public.ticket_events%rowtype;
  v_tier_count integer;
begin
  if v_user is null then raise exception 'Authentication required.'; end if;
  select * into v_event from public.ticket_events where id = p_event_id for update;
  if not found then raise exception 'Event not found.'; end if;
  if v_event.organizer_id is distinct from v_user then raise exception 'Organizer access required.'; end if;
  if v_event.status not in ('draft','changes_requested') then raise exception 'This event cannot be submitted in its current status.'; end if;
  if v_event.starts_at is null then raise exception 'A real event start date and time is required before review.'; end if;
  if v_event.starts_at <= now() then raise exception 'Event start time must be in the future.'; end if;
  if v_event.ends_at is not null and v_event.ends_at <= v_event.starts_at then raise exception 'Event end time must be after the start time.'; end if;

  select count(*) into v_tier_count from public.ticket_tiers where event_id = p_event_id and available = true and capacity_total > 0;
  if v_tier_count < 1 then raise exception 'Add at least one available ticket type before submitting.'; end if;

  update public.ticket_events set
    status = 'pending_review', submitted_at = now(), submitted_by = v_user,
    reviewed_at = null, reviewed_by = null, review_note = null, updated_at = now()
  where id = p_event_id;

  insert into public.ticket_event_review_log(event_id, actor_id, action, from_status, to_status)
  values (p_event_id, v_user, 'submitted', v_event.status, 'pending_review');

  return jsonb_build_object('ok', true, 'event_id', p_event_id, 'status', 'pending_review');
end;
$$;

create or replace function public.admin_review_ticket_event(
  p_event_id uuid,
  p_action text,
  p_note text default null
) returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_admin uuid := auth.uid();
  v_event public.ticket_events%rowtype;
  v_action text := lower(trim(coalesce(p_action,'')));
  v_status text;
begin
  if v_admin is null or not public.is_admin() then raise exception 'Admin access required.'; end if;
  select * into v_event from public.ticket_events where id = p_event_id for update;
  if not found then raise exception 'Event not found.'; end if;
  if v_event.status <> 'pending_review' then raise exception 'Only pending-review events can be reviewed.'; end if;

  if v_action = 'approve' then
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
    status = v_status, reviewed_at = now(), reviewed_by = v_admin, review_note = nullif(trim(p_note), ''),
    published_at = case when v_status = 'published' then now() else published_at end, updated_at = now()
  where id = p_event_id;

  insert into public.ticket_event_review_log(event_id, actor_id, action, from_status, to_status, note)
  values (p_event_id, v_admin, case when v_action='approve' then 'approved' else v_action end, v_event.status, v_status, nullif(trim(p_note),''));

  return jsonb_build_object('ok', true, 'event_id', p_event_id, 'status', v_status);
end;
$$;

create or replace function public.get_my_organizer_events() returns jsonb
language sql
security definer
set search_path = public, auth
as $$
  select coalesce(jsonb_agg(row_data order by row_data->>'updated_at' desc), '[]'::jsonb)
  from (
    select jsonb_build_object(
      'id', e.id, 'title', e.title, 'category', e.category, 'date_label', e.date_label,
      'starts_at', e.starts_at, 'ends_at', e.ends_at, 'venue', e.venue, 'city', e.city,
      'image_url', e.image_url, 'hero_image_url', e.hero_image_url, 'status', e.status,
      'review_note', e.review_note, 'submitted_at', e.submitted_at, 'reviewed_at', e.reviewed_at,
      'published_at', e.published_at, 'updated_at', e.updated_at,
      'tickets_sold', coalesce(stats.tickets_sold,0), 'gross_sales_mwk', coalesce(stats.gross_sales_mwk,0),
      'capacity_total', coalesce(tiers.capacity_total,0),
      'capacity_remaining', greatest(0, coalesce(tiers.capacity_total,0)-coalesce(tiers.capacity_sold,0)-coalesce(tiers.capacity_reserved,0))
    ) as row_data
    from public.ticket_events e
    left join lateral (
      select sum(t.capacity_total)::bigint as capacity_total, sum(t.capacity_sold)::bigint as capacity_sold, sum(t.capacity_reserved)::bigint as capacity_reserved
      from public.ticket_tiers t where t.event_id=e.id
    ) tiers on true
    left join lateral (
      select sum(o.quantity)::bigint as tickets_sold, sum(o.total_mwk)::numeric as gross_sales_mwk
      from public.ticket_orders o where o.event_id=e.id and o.payment_status='paid'
    ) stats on true
    where e.organizer_id = auth.uid()
  ) q;
$$;

revoke all on function public.create_my_ticket_event_draft(text,text,text,text,timestamptz,timestamptz,text,text,text,text) from public, anon;
revoke all on function public.update_my_ticket_event_draft(uuid,text,text,text,text,timestamptz,timestamptz,text,text,text,text) from public, anon;
revoke all on function public.upsert_my_ticket_tier(uuid,uuid,text,text,numeric,integer,boolean,timestamptz,timestamptz,integer) from public, anon;
revoke all on function public.submit_my_ticket_event(uuid) from public, anon;
revoke all on function public.admin_review_ticket_event(uuid,text,text) from public, anon;
revoke all on function public.get_my_organizer_events() from public, anon;

grant execute on function public.create_my_ticket_event_draft(text,text,text,text,timestamptz,timestamptz,text,text,text,text) to authenticated;
grant execute on function public.update_my_ticket_event_draft(uuid,text,text,text,text,timestamptz,timestamptz,text,text,text,text) to authenticated;
grant execute on function public.upsert_my_ticket_tier(uuid,uuid,text,text,numeric,integer,boolean,timestamptz,timestamptz,integer) to authenticated;
grant execute on function public.submit_my_ticket_event(uuid) to authenticated;
grant execute on function public.admin_review_ticket_event(uuid,text,text) to authenticated;
grant execute on function public.get_my_organizer_events() to authenticated;
