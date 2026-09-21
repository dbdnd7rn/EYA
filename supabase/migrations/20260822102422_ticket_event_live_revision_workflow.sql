create table if not exists public.ticket_event_revisions (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.ticket_events(id) on delete cascade,
  organizer_id uuid not null references auth.users(id) on delete restrict,
  organizer_access_grant_id uuid not null references public.ticket_organizer_access_grants(id) on delete restrict,
  base_approval_version_id uuid not null references public.ticket_event_approval_versions(id) on delete restrict,
  base_version_number integer not null,
  status text not null default 'draft' check (status in ('draft','pending_review','changes_requested','approved','rejected','cancelled')),
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
  submitted_at timestamptz,
  submitted_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id) on delete set null,
  review_note text,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists ticket_event_revisions_one_open_idx
on public.ticket_event_revisions(event_id)
where status in ('draft','pending_review','changes_requested');
create index if not exists ticket_event_revisions_organizer_idx on public.ticket_event_revisions(organizer_id, updated_at desc);
create index if not exists ticket_event_revisions_status_idx on public.ticket_event_revisions(status, submitted_at);

create table if not exists public.ticket_event_revision_tiers (
  id uuid primary key default gen_random_uuid(),
  revision_id uuid not null references public.ticket_event_revisions(id) on delete cascade,
  source_tier_id uuid references public.ticket_tiers(id) on delete restrict,
  name text not null,
  description text not null default '',
  price_mwk numeric not null check (price_mwk >= 0),
  capacity_total integer not null check (capacity_total >= 0),
  available boolean not null default true,
  sale_starts_at timestamptz,
  sale_ends_at timestamptz,
  sort_order integer not null default 100,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists ticket_event_revision_tiers_source_idx
on public.ticket_event_revision_tiers(revision_id, source_tier_id)
where source_tier_id is not null;
create index if not exists ticket_event_revision_tiers_revision_idx on public.ticket_event_revision_tiers(revision_id, sort_order);

create table if not exists public.ticket_event_revision_review_log (
  id uuid primary key default gen_random_uuid(),
  revision_id uuid not null references public.ticket_event_revisions(id) on delete cascade,
  event_id uuid not null references public.ticket_events(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete set null,
  action text not null check (action in ('created','edited','submitted','changes_requested','rejected','approved','cancelled')),
  from_status text,
  to_status text,
  note text,
  created_at timestamptz not null default now()
);
create index if not exists ticket_event_revision_review_log_revision_idx on public.ticket_event_revision_review_log(revision_id, created_at);

create table if not exists public.ticket_event_revision_apply_context (
  txid bigint not null,
  event_id uuid not null references public.ticket_events(id) on delete cascade,
  revision_id uuid not null references public.ticket_event_revisions(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (txid, event_id)
);

alter table public.ticket_event_revisions enable row level security;
alter table public.ticket_event_revision_tiers enable row level security;
alter table public.ticket_event_revision_review_log enable row level security;
alter table public.ticket_event_revision_apply_context enable row level security;

revoke all on public.ticket_event_revisions from anon, authenticated;
revoke all on public.ticket_event_revision_tiers from anon, authenticated;
revoke all on public.ticket_event_revision_review_log from anon, authenticated;
revoke all on public.ticket_event_revision_apply_context from anon, authenticated;

create or replace function public.ticket_revision_apply_allowed(p_event_id uuid)
returns boolean
language sql
security definer
set search_path = public, pg_temp
as $$
  select exists(
    select 1
    from public.ticket_event_revision_apply_context c
    where c.txid = txid_current() and c.event_id = p_event_id
  );
$$;
revoke all on function public.ticket_revision_apply_allowed(uuid) from public, anon, authenticated;
grant execute on function public.ticket_revision_apply_allowed(uuid) to service_role, postgres;

create or replace function public.protect_approved_ticket_event_material()
returns trigger
language plpgsql
set search_path = public, auth, pg_temp
as $$
begin
  if old.organizer_id is null or old.approved_version_id is null then
    return new;
  end if;

  if public.ticket_revision_apply_allowed(old.id) then
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
$$;

create or replace function public.protect_approved_ticket_tier_material()
returns trigger
language plpgsql
set search_path = public, auth, pg_temp
as $$
declare
  v_event public.ticket_events%rowtype;
  v_event_id uuid;
begin
  v_event_id := case when tg_op = 'DELETE' then old.event_id else new.event_id end;
  select * into v_event from public.ticket_events where id = v_event_id;

  if not found or v_event.organizer_id is null or v_event.approved_version_id is null then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  if public.ticket_revision_apply_allowed(v_event_id) then
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
$$;

create or replace function public.get_my_organizer_events()
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_grant uuid;
  v_result jsonb;
begin
  if v_user is null then raise exception 'Authentication required.'; end if;
  v_grant := public.current_ticket_organizer_grant(v_user);
  if v_grant is null then return '[]'::jsonb; end if;

  select coalesce(jsonb_agg(row_data order by row_data->>'updated_at' desc), '[]'::jsonb)
  into v_result
  from (
    select jsonb_build_object(
      'id', e.id, 'title', e.title, 'category', e.category, 'date_label', e.date_label,
      'starts_at', e.starts_at, 'ends_at', e.ends_at, 'venue', e.venue, 'city', e.city,
      'image_url', e.image_url, 'hero_image_url', e.hero_image_url, 'status', e.status,
      'review_note', e.review_note, 'submitted_at', e.submitted_at, 'reviewed_at', e.reviewed_at,
      'published_at', e.published_at, 'updated_at', e.updated_at,
      'approved_version_number', e.approved_version_number,
      'open_revision_status', r.status,
      'open_revision_id', r.id,
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
    left join lateral (
      select rr.id, rr.status
      from public.ticket_event_revisions rr
      where rr.event_id=e.id and rr.organizer_id=v_user and rr.status in ('draft','pending_review','changes_requested')
      order by rr.updated_at desc limit 1
    ) r on true
    where e.organizer_id = v_user
  ) q;
  return v_result;
end;
$$;

create or replace function public.get_my_organizer_event_detail(p_event_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_grant uuid;
  v_event public.ticket_events%rowtype;
  v_tiers jsonb;
  v_revision public.ticket_event_revisions%rowtype;
begin
  if v_user is null then raise exception 'Authentication required.'; end if;
  v_grant := public.current_ticket_organizer_grant(v_user);
  if v_grant is null then raise exception 'Temporary Organizer Workspace access is expired or revoked.'; end if;

  select * into v_event
  from public.ticket_events
  where id = p_event_id and organizer_id = v_user;
  if not found then raise exception 'Organizer event not found for this identity.'; end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', t.id,'name',t.name,'description',t.description,'price_mwk',t.price_mwk,
    'capacity_total',t.capacity_total,'capacity_sold',t.capacity_sold,'capacity_reserved',t.capacity_reserved,
    'available',t.available,'sale_starts_at',t.sale_starts_at,'sale_ends_at',t.sale_ends_at,'sort_order',t.sort_order
  ) order by t.sort_order, t.created_at), '[]'::jsonb)
  into v_tiers from public.ticket_tiers t where t.event_id = p_event_id;

  select * into v_revision
  from public.ticket_event_revisions r
  where r.event_id=p_event_id and r.organizer_id=v_user and r.status in ('draft','pending_review','changes_requested')
  order by r.updated_at desc limit 1;

  return jsonb_build_object(
    'id',v_event.id,'title',v_event.title,'category',v_event.category,'description',v_event.description,
    'date_label',v_event.date_label,'starts_at',v_event.starts_at,'ends_at',v_event.ends_at,
    'venue',v_event.venue,'city',v_event.city,'image_url',v_event.image_url,'hero_image_url',v_event.hero_image_url,
    'status',v_event.status,'review_note',v_event.review_note,'submitted_at',v_event.submitted_at,
    'reviewed_at',v_event.reviewed_at,'published_at',v_event.published_at,
    'approved_version_id',v_event.approved_version_id,'approved_version_number',v_event.approved_version_number,
    'open_revision_id',case when v_revision.id is null then null else v_revision.id end,
    'open_revision_status',case when v_revision.id is null then null else v_revision.status end,
    'tiers',v_tiers
  );
end;
$$;

create or replace function public.update_my_ticket_event_draft(
  p_event_id uuid, p_title text, p_category text, p_description text, p_date_label text,
  p_starts_at timestamptz, p_ends_at timestamptz, p_venue text, p_city text,
  p_image_url text, p_hero_image_url text
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_event public.ticket_events%rowtype;
  v_from text;
begin
  if v_user is null then raise exception 'Authentication required.'; end if;
  if public.current_ticket_organizer_grant(v_user) is null then raise exception 'Your temporary Organizer Workspace is expired or revoked.'; end if;
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
  p_event_id uuid, p_tier_id uuid, p_name text, p_description text, p_price_mwk numeric,
  p_capacity_total integer, p_available boolean default true, p_sale_starts_at timestamptz default null,
  p_sale_ends_at timestamptz default null, p_sort_order integer default 100
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_event public.ticket_events%rowtype;
  v_tier public.ticket_tiers%rowtype;
begin
  if v_user is null then raise exception 'Authentication required.'; end if;
  if public.current_ticket_organizer_grant(v_user) is null then raise exception 'Your temporary Organizer Workspace is expired or revoked.'; end if;
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

create or replace function public.submit_my_ticket_event(p_event_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_event public.ticket_events%rowtype;
  v_tier_count integer;
begin
  if v_user is null then raise exception 'Authentication required.'; end if;
  if public.current_ticket_organizer_grant(v_user) is null then raise exception 'Your temporary Organizer Workspace is expired or revoked.'; end if;
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

create or replace function public.start_my_ticket_event_revision(p_event_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, extensions, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_grant uuid;
  v_event public.ticket_events%rowtype;
  v_revision public.ticket_event_revisions%rowtype;
begin
  if v_user is null then raise exception 'Authentication required.'; end if;
  v_grant := public.current_ticket_organizer_grant(v_user);
  if v_grant is null then raise exception 'Temporary Organizer Workspace access is expired or revoked.'; end if;

  select * into v_event from public.ticket_events where id=p_event_id for update;
  if not found or v_event.organizer_id is distinct from v_user then raise exception 'Organizer event not found.'; end if;
  if v_event.status <> 'published' then raise exception 'Only a currently published event can start a live revision.'; end if;
  if v_event.approved_version_id is null or not public.ticket_event_current_approval_matches(v_event.id) then
    raise exception 'Current published event approval integrity could not be verified.';
  end if;
  if exists(select 1 from public.ticket_event_revisions r where r.event_id=p_event_id and r.status in ('draft','pending_review','changes_requested')) then
    raise exception 'This event already has an open revision.';
  end if;

  insert into public.ticket_event_revisions(
    event_id, organizer_id, organizer_access_grant_id, base_approval_version_id, base_version_number,
    status, title, category, description, date_label, starts_at, ends_at, venue, city, image_url, hero_image_url
  ) values (
    v_event.id, v_user, v_grant, v_event.approved_version_id, v_event.approved_version_number,
    'draft', v_event.title, v_event.category, v_event.description, v_event.date_label, v_event.starts_at,
    v_event.ends_at, v_event.venue, v_event.city, v_event.image_url, v_event.hero_image_url
  ) returning * into v_revision;

  insert into public.ticket_event_revision_tiers(
    revision_id, source_tier_id, name, description, price_mwk, capacity_total, available,
    sale_starts_at, sale_ends_at, sort_order, metadata
  )
  select v_revision.id, t.id, t.name, t.description, t.price_mwk, t.capacity_total, t.available,
         t.sale_starts_at, t.sale_ends_at, t.sort_order, t.metadata
  from public.ticket_tiers t where t.event_id=p_event_id;

  insert into public.ticket_event_revision_review_log(revision_id,event_id,actor_id,action,from_status,to_status)
  values(v_revision.id,p_event_id,v_user,'created',null,'draft');

  return jsonb_build_object('ok',true,'revision_id',v_revision.id,'event_id',p_event_id,'status','draft','base_version_number',v_revision.base_version_number);
end;
$$;

create or replace function public.get_my_ticket_event_revision(p_revision_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_revision public.ticket_event_revisions%rowtype;
  v_event public.ticket_events%rowtype;
  v_tiers jsonb;
begin
  if v_user is null then raise exception 'Authentication required.'; end if;
  if public.current_ticket_organizer_grant(v_user) is null then raise exception 'Temporary Organizer Workspace access is expired or revoked.'; end if;

  select * into v_revision from public.ticket_event_revisions where id=p_revision_id and organizer_id=v_user;
  if not found then raise exception 'Revision not found.'; end if;
  select * into v_event from public.ticket_events where id=v_revision.event_id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',rt.id,'source_tier_id',rt.source_tier_id,'name',rt.name,'description',rt.description,
    'price_mwk',rt.price_mwk,'capacity_total',rt.capacity_total,'available',rt.available,
    'sale_starts_at',rt.sale_starts_at,'sale_ends_at',rt.sale_ends_at,'sort_order',rt.sort_order
  ) order by rt.sort_order, rt.created_at),'[]'::jsonb)
  into v_tiers from public.ticket_event_revision_tiers rt where rt.revision_id=p_revision_id;

  return jsonb_build_object(
    'id',v_revision.id,'event_id',v_revision.event_id,'status',v_revision.status,
    'base_version_number',v_revision.base_version_number,'review_note',v_revision.review_note,
    'title',v_revision.title,'category',v_revision.category,'description',v_revision.description,
    'date_label',v_revision.date_label,'starts_at',v_revision.starts_at,'ends_at',v_revision.ends_at,
    'venue',v_revision.venue,'city',v_revision.city,'image_url',v_revision.image_url,'hero_image_url',v_revision.hero_image_url,
    'live_status',v_event.status,'live_version_number',v_event.approved_version_number,
    'tiers',v_tiers
  );
end;
$$;

create or replace function public.update_my_ticket_event_revision(
  p_revision_id uuid, p_title text, p_category text, p_description text, p_date_label text,
  p_starts_at timestamptz, p_ends_at timestamptz, p_venue text, p_city text,
  p_image_url text, p_hero_image_url text
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_revision public.ticket_event_revisions%rowtype;
  v_from text;
begin
  if v_user is null then raise exception 'Authentication required.'; end if;
  if public.current_ticket_organizer_grant(v_user) is null then raise exception 'Temporary Organizer Workspace access is expired or revoked.'; end if;
  select * into v_revision from public.ticket_event_revisions where id=p_revision_id for update;
  if not found or v_revision.organizer_id is distinct from v_user then raise exception 'Revision not found.'; end if;
  if v_revision.status not in ('draft','changes_requested') then raise exception 'This revision cannot be edited in its current status.'; end if;
  if nullif(trim(p_title),'') is null or nullif(trim(p_date_label),'') is null or nullif(trim(p_venue),'') is null or nullif(trim(p_city),'') is null then raise exception 'Title, date, venue, and city are required.'; end if;
  if nullif(trim(p_image_url),'') is null or nullif(trim(p_hero_image_url),'') is null then raise exception 'Card and hero images are required.'; end if;
  if p_ends_at is not null and p_starts_at is not null and p_ends_at <= p_starts_at then raise exception 'Event end time must be after the start time.'; end if;

  v_from := v_revision.status;
  update public.ticket_event_revisions set
    title=trim(p_title), category=coalesce(nullif(trim(p_category),''),'Music'), description=nullif(trim(p_description),''),
    date_label=trim(p_date_label), starts_at=p_starts_at, ends_at=p_ends_at, venue=trim(p_venue), city=trim(p_city),
    image_url=trim(p_image_url), hero_image_url=trim(p_hero_image_url), status='draft', review_note=null, updated_at=now()
  where id=p_revision_id;

  insert into public.ticket_event_revision_review_log(revision_id,event_id,actor_id,action,from_status,to_status)
  values(p_revision_id,v_revision.event_id,v_user,'edited',v_from,'draft');

  return jsonb_build_object('ok',true,'revision_id',p_revision_id,'status','draft');
end;
$$;

create or replace function public.upsert_my_ticket_event_revision_tier(
  p_revision_id uuid, p_revision_tier_id uuid, p_name text, p_description text, p_price_mwk numeric,
  p_capacity_total integer, p_available boolean default true, p_sale_starts_at timestamptz default null,
  p_sale_ends_at timestamptz default null, p_sort_order integer default 100
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_revision public.ticket_event_revisions%rowtype;
  v_rt public.ticket_event_revision_tiers%rowtype;
  v_live public.ticket_tiers%rowtype;
begin
  if v_user is null then raise exception 'Authentication required.'; end if;
  if public.current_ticket_organizer_grant(v_user) is null then raise exception 'Temporary Organizer Workspace access is expired or revoked.'; end if;
  select * into v_revision from public.ticket_event_revisions where id=p_revision_id for update;
  if not found or v_revision.organizer_id is distinct from v_user then raise exception 'Revision not found.'; end if;
  if v_revision.status not in ('draft','changes_requested') then raise exception 'Ticket terms cannot be edited in this revision status.'; end if;
  if nullif(trim(p_name),'') is null then raise exception 'Ticket name is required.'; end if;
  if coalesce(p_price_mwk,-1) < 0 then raise exception 'Ticket price cannot be negative.'; end if;
  if coalesce(p_capacity_total,0) < 1 then raise exception 'Ticket capacity must be at least 1.'; end if;
  if p_sale_ends_at is not null and p_sale_starts_at is not null and p_sale_ends_at <= p_sale_starts_at then raise exception 'Ticket sale end must be after sale start.'; end if;

  if p_revision_tier_id is null then
    insert into public.ticket_event_revision_tiers(revision_id,source_tier_id,name,description,price_mwk,capacity_total,available,sale_starts_at,sale_ends_at,sort_order)
    values(p_revision_id,null,trim(p_name),coalesce(trim(p_description),''),p_price_mwk,p_capacity_total,coalesce(p_available,true),p_sale_starts_at,p_sale_ends_at,coalesce(p_sort_order,100))
    returning * into v_rt;
  else
    select * into v_rt from public.ticket_event_revision_tiers where id=p_revision_tier_id and revision_id=p_revision_id for update;
    if not found then raise exception 'Revision ticket type not found.'; end if;
    if v_rt.source_tier_id is not null then
      select * into v_live from public.ticket_tiers where id=v_rt.source_tier_id and event_id=v_revision.event_id;
      if found and p_capacity_total < (v_live.capacity_sold + v_live.capacity_reserved) then
        raise exception 'Capacity cannot be lower than tickets already sold or reserved.';
      end if;
    end if;
    update public.ticket_event_revision_tiers set
      name=trim(p_name),description=coalesce(trim(p_description),''),price_mwk=p_price_mwk,
      capacity_total=p_capacity_total,available=coalesce(p_available,true),sale_starts_at=p_sale_starts_at,
      sale_ends_at=p_sale_ends_at,sort_order=coalesce(p_sort_order,100),updated_at=now()
    where id=p_revision_tier_id returning * into v_rt;
  end if;

  if v_revision.status='changes_requested' then
    update public.ticket_event_revisions set status='draft',review_note=null,updated_at=now() where id=p_revision_id;
  else
    update public.ticket_event_revisions set updated_at=now() where id=p_revision_id;
  end if;

  return jsonb_build_object('ok',true,'revision_tier_id',v_rt.id,'revision_id',p_revision_id);
end;
$$;

create or replace function public.remove_my_ticket_event_revision_tier(p_revision_tier_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_rt public.ticket_event_revision_tiers%rowtype;
  v_revision public.ticket_event_revisions%rowtype;
begin
  if v_user is null then raise exception 'Authentication required.'; end if;
  if public.current_ticket_organizer_grant(v_user) is null then raise exception 'Temporary Organizer Workspace access is expired or revoked.'; end if;
  select * into v_rt from public.ticket_event_revision_tiers where id=p_revision_tier_id for update;
  if not found then raise exception 'Revision ticket type not found.'; end if;
  select * into v_revision from public.ticket_event_revisions where id=v_rt.revision_id for update;
  if v_revision.organizer_id is distinct from v_user then raise exception 'Organizer access required.'; end if;
  if v_revision.status not in ('draft','changes_requested') then raise exception 'Ticket terms cannot be edited in this revision status.'; end if;

  if v_rt.source_tier_id is null then
    delete from public.ticket_event_revision_tiers where id=p_revision_tier_id;
  else
    update public.ticket_event_revision_tiers set available=false,updated_at=now() where id=p_revision_tier_id;
  end if;
  update public.ticket_event_revisions set status='draft',review_note=null,updated_at=now() where id=v_revision.id;
  return jsonb_build_object('ok',true,'revision_id',v_revision.id,'disabled',v_rt.source_tier_id is not null);
end;
$$;

create or replace function public.submit_my_ticket_event_revision(p_revision_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_revision public.ticket_event_revisions%rowtype;
  v_event public.ticket_events%rowtype;
  v_count integer;
begin
  if v_user is null then raise exception 'Authentication required.'; end if;
  if public.current_ticket_organizer_grant(v_user) is null then raise exception 'Temporary Organizer Workspace access is expired or revoked.'; end if;
  select * into v_revision from public.ticket_event_revisions where id=p_revision_id for update;
  if not found or v_revision.organizer_id is distinct from v_user then raise exception 'Revision not found.'; end if;
  if v_revision.status not in ('draft','changes_requested') then raise exception 'This revision cannot be submitted in its current status.'; end if;
  select * into v_event from public.ticket_events where id=v_revision.event_id for update;
  if not found or v_event.status <> 'published' then raise exception 'The live event is no longer published.'; end if;
  if v_event.approved_version_id is distinct from v_revision.base_approval_version_id or not public.ticket_event_current_approval_matches(v_event.id) then
    raise exception 'The live event changed since this revision started. Create a fresh revision.';
  end if;
  if v_revision.starts_at is null or v_revision.starts_at <= now() then raise exception 'Revised event start time must be in the future.'; end if;
  if v_revision.ends_at is not null and v_revision.ends_at <= v_revision.starts_at then raise exception 'Event end time must be after start time.'; end if;

  select count(*) into v_count from public.ticket_event_revision_tiers where revision_id=p_revision_id and available=true and capacity_total>0;
  if v_count < 1 then raise exception 'At least one available ticket type is required.'; end if;
  if exists(
    select 1
    from public.ticket_event_revision_tiers rt
    join public.ticket_tiers t on t.id=rt.source_tier_id
    where rt.revision_id=p_revision_id and rt.capacity_total < (t.capacity_sold+t.capacity_reserved)
  ) then raise exception 'A revised capacity is lower than tickets already sold or reserved.'; end if;

  update public.ticket_event_revisions set status='pending_review',submitted_at=now(),submitted_by=v_user,reviewed_at=null,reviewed_by=null,review_note=null,updated_at=now() where id=p_revision_id;
  insert into public.ticket_event_revision_review_log(revision_id,event_id,actor_id,action,from_status,to_status)
  values(p_revision_id,v_revision.event_id,v_user,'submitted',v_revision.status,'pending_review');
  return jsonb_build_object('ok',true,'revision_id',p_revision_id,'event_id',v_revision.event_id,'status','pending_review');
end;
$$;

create or replace function public.admin_list_pending_ticket_event_revisions()
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_result jsonb;
begin
  if auth.uid() is null or not public.is_admin() then raise exception 'Admin access required.'; end if;
  select coalesce(jsonb_agg(row_data order by row_data->>'submitted_at'), '[]'::jsonb) into v_result
  from (
    select jsonb_build_object(
      'id',r.id,'event_id',r.event_id,'status',r.status,'base_version_number',r.base_version_number,
      'submitted_at',r.submitted_at,'review_note',r.review_note,
      'organizer_id',r.organizer_id,
      'organizer',jsonb_build_object('full_name',p.full_name,'email',p.email,'phone',p.phone),
      'revision_event',jsonb_build_object('title',r.title,'category',r.category,'description',r.description,'date_label',r.date_label,'starts_at',r.starts_at,'ends_at',r.ends_at,'venue',r.venue,'city',r.city,'image_url',r.image_url,'hero_image_url',r.hero_image_url),
      'live_event',jsonb_build_object('title',e.title,'category',e.category,'description',e.description,'date_label',e.date_label,'starts_at',e.starts_at,'ends_at',e.ends_at,'venue',e.venue,'city',e.city,'image_url',e.image_url,'hero_image_url',e.hero_image_url,'approved_version_number',e.approved_version_number),
      'revision_tiers',(select coalesce(jsonb_agg(jsonb_build_object('id',rt.id,'source_tier_id',rt.source_tier_id,'name',rt.name,'description',rt.description,'price_mwk',rt.price_mwk,'capacity_total',rt.capacity_total,'available',rt.available,'sale_starts_at',rt.sale_starts_at,'sale_ends_at',rt.sale_ends_at,'sort_order',rt.sort_order) order by rt.sort_order,rt.created_at),'[]'::jsonb) from public.ticket_event_revision_tiers rt where rt.revision_id=r.id),
      'live_tiers',(select coalesce(jsonb_agg(jsonb_build_object('id',t.id,'name',t.name,'description',t.description,'price_mwk',t.price_mwk,'capacity_total',t.capacity_total,'capacity_sold',t.capacity_sold,'capacity_reserved',t.capacity_reserved,'available',t.available,'sale_starts_at',t.sale_starts_at,'sale_ends_at',t.sale_ends_at,'sort_order',t.sort_order) order by t.sort_order,t.created_at),'[]'::jsonb) from public.ticket_tiers t where t.event_id=e.id)
    ) row_data
    from public.ticket_event_revisions r
    join public.ticket_events e on e.id=r.event_id
    left join public.profiles p on p.id=r.organizer_id
    where r.status='pending_review'
  ) q;
  return v_result;
end;
$$;

create or replace function public.admin_review_ticket_event_revision(p_revision_id uuid, p_action text, p_note text default null)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, extensions, pg_temp
as $$
declare
  v_admin uuid := auth.uid();
  v_action text := lower(trim(coalesce(p_action,'')));
  v_revision public.ticket_event_revisions%rowtype;
  v_event public.ticket_events%rowtype;
  v_rt record;
  v_live public.ticket_tiers%rowtype;
  v_new_tier public.ticket_tiers%rowtype;
  v_snapshot jsonb;
  v_hash text;
  v_version integer;
  v_approval public.ticket_event_approval_versions%rowtype;
  v_current_grant uuid;
begin
  if v_admin is null or not public.is_admin() then raise exception 'Admin access required.'; end if;
  select * into v_revision from public.ticket_event_revisions where id=p_revision_id for update;
  if not found then raise exception 'Revision not found.'; end if;
  if v_revision.status <> 'pending_review' then raise exception 'Only pending revisions can be reviewed.'; end if;

  if v_action='request_changes' then
    if nullif(trim(p_note),'') is null then raise exception 'A review note is required when requesting changes.'; end if;
    update public.ticket_event_revisions set status='changes_requested',reviewed_at=now(),reviewed_by=v_admin,review_note=trim(p_note),updated_at=now() where id=p_revision_id;
    insert into public.ticket_event_revision_review_log(revision_id,event_id,actor_id,action,from_status,to_status,note)
    values(p_revision_id,v_revision.event_id,v_admin,'changes_requested','pending_review','changes_requested',trim(p_note));
    return jsonb_build_object('ok',true,'revision_id',p_revision_id,'status','changes_requested');
  elsif v_action='reject' then
    if nullif(trim(p_note),'') is null then raise exception 'A review note is required when rejecting a revision.'; end if;
    update public.ticket_event_revisions set status='rejected',reviewed_at=now(),reviewed_by=v_admin,review_note=trim(p_note),updated_at=now() where id=p_revision_id;
    insert into public.ticket_event_revision_review_log(revision_id,event_id,actor_id,action,from_status,to_status,note)
    values(p_revision_id,v_revision.event_id,v_admin,'rejected','pending_review','rejected',trim(p_note));
    return jsonb_build_object('ok',true,'revision_id',p_revision_id,'status','rejected');
  elsif v_action <> 'approve' then
    raise exception 'Unsupported revision review action.';
  end if;

  v_current_grant := public.current_ticket_organizer_grant(v_revision.organizer_id);
  if v_current_grant is null then raise exception 'Organizer access is expired or revoked. Re-enable it before approving this revision.'; end if;

  select * into v_event from public.ticket_events where id=v_revision.event_id for update;
  if not found or v_event.status <> 'published' then raise exception 'The live event is no longer published.'; end if;
  if v_event.approved_version_id is distinct from v_revision.base_approval_version_id or not public.ticket_event_current_approval_matches(v_event.id) then
    raise exception 'The live event changed since this revision was created. Reject it and create a fresh revision.';
  end if;
  if v_revision.starts_at is null or v_revision.starts_at <= now() then raise exception 'Revised event start time must be in the future.'; end if;
  if v_revision.ends_at is not null and v_revision.ends_at <= v_revision.starts_at then raise exception 'Event end time must be after start time.'; end if;
  if not exists(select 1 from public.ticket_event_revision_tiers where revision_id=p_revision_id and available=true and capacity_total>0) then
    raise exception 'At least one available ticket type is required.';
  end if;

  insert into public.ticket_event_revision_apply_context(txid,event_id,revision_id)
  values(txid_current(),v_event.id,p_revision_id);

  update public.ticket_events set
    title=v_revision.title, category=v_revision.category, description=v_revision.description,
    date_label=v_revision.date_label, starts_at=v_revision.starts_at, ends_at=v_revision.ends_at,
    venue=v_revision.venue, city=v_revision.city, image_url=v_revision.image_url, hero_image_url=v_revision.hero_image_url,
    updated_at=now()
  where id=v_event.id;

  for v_rt in select * from public.ticket_event_revision_tiers where revision_id=p_revision_id order by sort_order,created_at loop
    if v_rt.source_tier_id is not null then
      select * into v_live from public.ticket_tiers where id=v_rt.source_tier_id and event_id=v_event.id for update;
      if not found then raise exception 'A live ticket type referenced by this revision no longer exists.'; end if;
      if v_rt.capacity_total < (v_live.capacity_sold+v_live.capacity_reserved) then raise exception 'Revised capacity for % is lower than tickets already sold or reserved.', v_live.name; end if;
      update public.ticket_tiers set
        name=v_rt.name,description=v_rt.description,price_mwk=v_rt.price_mwk,capacity_total=v_rt.capacity_total,
        available=v_rt.available,sale_starts_at=v_rt.sale_starts_at,sale_ends_at=v_rt.sale_ends_at,
        sort_order=v_rt.sort_order,metadata=v_rt.metadata,updated_at=now()
      where id=v_live.id;
    else
      insert into public.ticket_tiers(event_id,name,description,price_mwk,capacity_total,capacity_sold,capacity_reserved,available,sale_starts_at,sale_ends_at,sort_order,metadata)
      values(v_event.id,v_rt.name,v_rt.description,v_rt.price_mwk,v_rt.capacity_total,0,0,v_rt.available,v_rt.sale_starts_at,v_rt.sale_ends_at,v_rt.sort_order,v_rt.metadata)
      returning * into v_new_tier;
      update public.ticket_event_revision_tiers set source_tier_id=v_new_tier.id,updated_at=now() where id=v_rt.id;
    end if;
  end loop;

  v_snapshot := public.ticket_event_material_snapshot(v_event.id);
  v_hash := encode(extensions.digest(convert_to(v_snapshot::text,'UTF8'),'sha256'),'hex');
  select coalesce(max(version_number),0)+1 into v_version from public.ticket_event_approval_versions where event_id=v_event.id;
  insert into public.ticket_event_approval_versions(event_id,version_number,approved_by,approved_at,event_snapshot,tiers_snapshot,approval_hash,review_note)
  values(v_event.id,v_version,v_admin,now(),v_snapshot->'event',v_snapshot->'tiers',v_hash,nullif(trim(p_note),''))
  returning * into v_approval;

  update public.ticket_events set
    approved_version_id=v_approval.id,approved_version_number=v_approval.version_number,
    reviewed_at=now(),reviewed_by=v_admin,review_note=nullif(trim(p_note),''),updated_at=now()
  where id=v_event.id;

  update public.ticket_event_revisions set status='approved',reviewed_at=now(),reviewed_by=v_admin,review_note=nullif(trim(p_note),''),approved_at=now(),updated_at=now() where id=p_revision_id;
  insert into public.ticket_event_revision_review_log(revision_id,event_id,actor_id,action,from_status,to_status,note)
  values(p_revision_id,v_event.id,v_admin,'approved','pending_review','approved',concat('Approved live revision as version ',v_approval.version_number,coalesce(': '||nullif(trim(p_note),''),'')));
  delete from public.ticket_event_revision_apply_context where txid=txid_current() and event_id=v_event.id;

  return jsonb_build_object('ok',true,'revision_id',p_revision_id,'event_id',v_event.id,'status','approved','approved_version_id',v_approval.id,'approved_version_number',v_approval.version_number,'approval_hash',v_approval.approval_hash);
end;
$$;

create or replace function public.admin_review_ticket_event(p_event_id uuid, p_action text, p_note text default null)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, extensions, pg_temp
as $$
declare
  v_admin uuid := auth.uid();
  v_event public.ticket_events%rowtype;
  v_action text := lower(trim(coalesce(p_action,'')));
  v_status text;
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
    if v_event.organizer_id is null then raise exception 'Organizer review approval is only for organizer-owned events.'; end if;
    if public.current_ticket_organizer_grant(v_event.organizer_id) is null then raise exception 'This organizer access is expired or revoked. Re-enable it before publishing the event.'; end if;
    if v_event.starts_at is null or v_event.starts_at <= now() then raise exception 'Event start time must be in the future before approval.'; end if;
    if v_event.ends_at is not null and v_event.ends_at <= v_event.starts_at then raise exception 'Event end time must be after the start time.'; end if;
    select count(*) into v_tier_count from public.ticket_tiers t where t.event_id=p_event_id and t.available=true and t.capacity_total>0;
    if v_tier_count < 1 then raise exception 'At least one available ticket type must be approved with the event.'; end if;
    if exists(select 1 from public.ticket_tiers t where t.event_id=p_event_id and (t.price_mwk<0 or t.capacity_total<1 or t.capacity_total<(t.capacity_sold+t.capacity_reserved) or (t.sale_starts_at is not null and t.sale_ends_at is not null and t.sale_ends_at<=t.sale_starts_at))) then
      raise exception 'One or more ticket types have invalid price, capacity, or sale dates.';
    end if;
    v_snapshot := public.ticket_event_material_snapshot(p_event_id);
    v_hash := encode(extensions.digest(convert_to(v_snapshot::text,'UTF8'),'sha256'),'hex');
    select coalesce(max(version_number),0)+1 into v_version_number from public.ticket_event_approval_versions where event_id=p_event_id;
    insert into public.ticket_event_approval_versions(event_id,version_number,approved_by,approved_at,event_snapshot,tiers_snapshot,approval_hash,review_note)
    values(p_event_id,v_version_number,v_admin,now(),v_snapshot->'event',v_snapshot->'tiers',v_hash,nullif(trim(p_note),'')) returning * into v_approval;
    v_status := 'published';
  elsif v_action='request_changes' then
    v_status := 'changes_requested'; if nullif(trim(p_note),'') is null then raise exception 'A review note is required when requesting changes.'; end if;
  elsif v_action='reject' then
    v_status := 'rejected'; if nullif(trim(p_note),'') is null then raise exception 'A review note is required when rejecting an event.'; end if;
  else raise exception 'Unsupported review action.'; end if;

  update public.ticket_events set status=v_status,reviewed_at=now(),reviewed_by=v_admin,review_note=nullif(trim(p_note),''),published_at=case when v_status='published' then now() else published_at end,
    approved_version_id=case when v_status='published' then v_approval.id else approved_version_id end,
    approved_version_number=case when v_status='published' then v_approval.version_number else approved_version_number end,updated_at=now()
  where id=p_event_id;
  insert into public.ticket_event_review_log(event_id,actor_id,action,from_status,to_status,note)
  values(p_event_id,v_admin,case when v_action='approve' then 'approved' else v_action end,v_event.status,v_status,case when v_action='approve' then concat('Approved event + ticket configuration version ',v_approval.version_number,coalesce(': '||nullif(trim(p_note),''),'')) else nullif(trim(p_note),'') end);
  return jsonb_build_object('ok',true,'event_id',p_event_id,'status',v_status,'approved_version_id',case when v_status='published' then v_approval.id else null end,'approved_version_number',case when v_status='published' then v_approval.version_number else null end,'approval_hash',case when v_status='published' then v_approval.approval_hash else null end);
end;
$$;

revoke all on function public.start_my_ticket_event_revision(uuid) from public, anon;
revoke all on function public.get_my_ticket_event_revision(uuid) from public, anon;
revoke all on function public.update_my_ticket_event_revision(uuid,text,text,text,text,timestamptz,timestamptz,text,text,text,text) from public, anon;
revoke all on function public.upsert_my_ticket_event_revision_tier(uuid,uuid,text,text,numeric,integer,boolean,timestamptz,timestamptz,integer) from public, anon;
revoke all on function public.remove_my_ticket_event_revision_tier(uuid) from public, anon;
revoke all on function public.submit_my_ticket_event_revision(uuid) from public, anon;
revoke all on function public.admin_list_pending_ticket_event_revisions() from public, anon;
revoke all on function public.admin_review_ticket_event_revision(uuid,text,text) from public, anon;

grant execute on function public.start_my_ticket_event_revision(uuid) to authenticated, service_role, postgres;
grant execute on function public.get_my_ticket_event_revision(uuid) to authenticated, service_role, postgres;
grant execute on function public.update_my_ticket_event_revision(uuid,text,text,text,text,timestamptz,timestamptz,text,text,text,text) to authenticated, service_role, postgres;
grant execute on function public.upsert_my_ticket_event_revision_tier(uuid,uuid,text,text,numeric,integer,boolean,timestamptz,timestamptz,integer) to authenticated, service_role, postgres;
grant execute on function public.remove_my_ticket_event_revision_tier(uuid) to authenticated, service_role, postgres;
grant execute on function public.submit_my_ticket_event_revision(uuid) to authenticated, service_role, postgres;
grant execute on function public.admin_list_pending_ticket_event_revisions() to authenticated, service_role, postgres;
grant execute on function public.admin_review_ticket_event_revision(uuid,text,text) to authenticated, service_role, postgres;
;
