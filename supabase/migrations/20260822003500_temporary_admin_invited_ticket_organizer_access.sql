create table if not exists public.ticket_organizer_access_grants (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  organization_name text not null,
  status text not null default 'active' check (status = any (array['active'::text,'expired'::text,'revoked'::text])),
  starts_at timestamptz not null default now(),
  expires_at timestamptz not null,
  granted_by uuid not null references auth.users(id) on delete restrict,
  grant_note text,
  revoked_at timestamptz,
  revoked_by uuid references auth.users(id) on delete set null,
  revoke_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ticket_organizer_access_grants_window_check check (expires_at > starts_at)
);

create unique index if not exists ticket_organizer_access_one_active_idx
  on public.ticket_organizer_access_grants(user_id)
  where status = 'active';
create index if not exists ticket_organizer_access_expiry_idx
  on public.ticket_organizer_access_grants(status, expires_at);

alter table public.ticket_organizer_access_grants enable row level security;
revoke all on public.ticket_organizer_access_grants from public, anon, authenticated;
grant select on public.ticket_organizer_access_grants to authenticated;

drop policy if exists ticket_organizer_access_read_own_or_admin on public.ticket_organizer_access_grants;
create policy ticket_organizer_access_read_own_or_admin
on public.ticket_organizer_access_grants
for select
to authenticated
using (user_id = auth.uid() or public.is_admin());

alter table public.ticket_events
  add column if not exists organizer_access_grant_id uuid references public.ticket_organizer_access_grants(id) on delete restrict;
create index if not exists ticket_events_organizer_grant_idx
  on public.ticket_events(organizer_access_grant_id, status, updated_at desc);

create or replace function public.current_ticket_organizer_grant(p_user_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public, auth, pg_temp
as $$
  select g.id
  from public.ticket_organizer_access_grants g
  where g.user_id = p_user_id
    and g.status = 'active'
    and g.starts_at <= now()
    and g.expires_at > now()
  order by g.expires_at desc, g.created_at desc
  limit 1;
$$;
revoke all on function public.current_ticket_organizer_grant(uuid) from public, anon, authenticated;

create or replace function public.get_my_ticket_organizer_access()
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_grant public.ticket_organizer_access_grants%rowtype;
begin
  if v_user is null then raise exception 'Authentication required.'; end if;

  update public.ticket_organizer_access_grants
  set status = 'expired', updated_at = now()
  where user_id = v_user and status = 'active' and expires_at <= now();

  select * into v_grant
  from public.ticket_organizer_access_grants
  where user_id = v_user and status = 'active' and starts_at <= now() and expires_at > now()
  order by expires_at desc, created_at desc
  limit 1;

  if not found then return null; end if;

  return jsonb_build_object(
    'id', v_grant.id,
    'user_id', v_grant.user_id,
    'organization_name', v_grant.organization_name,
    'status', v_grant.status,
    'starts_at', v_grant.starts_at,
    'expires_at', v_grant.expires_at,
    'grant_note', v_grant.grant_note
  );
end;
$$;
revoke all on function public.get_my_ticket_organizer_access() from public, anon;
grant execute on function public.get_my_ticket_organizer_access() to authenticated;

create or replace function public.admin_grant_ticket_organizer_access(
  p_email text,
  p_organization_name text,
  p_expires_at timestamptz,
  p_note text default null
) returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_admin uuid := auth.uid();
  v_user uuid;
  v_grant public.ticket_organizer_access_grants%rowtype;
begin
  if v_admin is null or not public.is_admin() then raise exception 'Admin access required.'; end if;
  if nullif(trim(p_email), '') is null then raise exception 'Organizer email is required.'; end if;
  if nullif(trim(p_organization_name), '') is null then raise exception 'Organization name is required.'; end if;
  if p_expires_at is null or p_expires_at <= now() + interval '1 hour' then raise exception 'Organizer access expiry must be in the future.'; end if;

  select p.id into v_user
  from public.profiles p
  where lower(trim(coalesce(p.email,''))) = lower(trim(p_email))
  limit 1;
  if v_user is null then raise exception 'No EYA account was found for that email. Ask the organizer to create/sign in to EYA first.'; end if;

  update public.ticket_organizer_access_grants
  set status = 'expired', updated_at = now()
  where user_id = v_user and status = 'active' and expires_at <= now();

  if exists (
    select 1 from public.ticket_organizer_access_grants
    where user_id = v_user and status = 'active' and expires_at > now()
  ) then
    raise exception 'This EYA user already has active organizer access. Extend or revoke the current grant instead.';
  end if;

  insert into public.ticket_organizer_access_grants(
    user_id, organization_name, status, starts_at, expires_at, granted_by, grant_note
  ) values (
    v_user, trim(p_organization_name), 'active', now(), p_expires_at, v_admin, nullif(trim(p_note),'')
  ) returning * into v_grant;

  return jsonb_build_object(
    'ok', true,
    'grant_id', v_grant.id,
    'user_id', v_grant.user_id,
    'organization_name', v_grant.organization_name,
    'status', v_grant.status,
    'starts_at', v_grant.starts_at,
    'expires_at', v_grant.expires_at
  );
end;
$$;

create or replace function public.admin_extend_ticket_organizer_access(
  p_grant_id uuid,
  p_expires_at timestamptz,
  p_note text default null
) returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_admin uuid := auth.uid();
  v_grant public.ticket_organizer_access_grants%rowtype;
begin
  if v_admin is null or not public.is_admin() then raise exception 'Admin access required.'; end if;
  if p_expires_at is null or p_expires_at <= now() + interval '1 hour' then raise exception 'Organizer access expiry must be in the future.'; end if;

  select * into v_grant from public.ticket_organizer_access_grants where id = p_grant_id for update;
  if not found then raise exception 'Organizer access grant not found.'; end if;
  if v_grant.status = 'revoked' then raise exception 'Revoked organizer access cannot be reactivated. Create a new grant.'; end if;

  if exists (
    select 1 from public.ticket_organizer_access_grants g
    where g.user_id = v_grant.user_id and g.id <> v_grant.id and g.status = 'active' and g.expires_at > now()
  ) then raise exception 'This user already has another active organizer grant.'; end if;

  update public.ticket_organizer_access_grants
  set status = 'active', expires_at = p_expires_at,
      grant_note = coalesce(nullif(trim(p_note),''), grant_note), updated_at = now()
  where id = p_grant_id
  returning * into v_grant;

  return jsonb_build_object('ok',true,'grant_id',v_grant.id,'status',v_grant.status,'expires_at',v_grant.expires_at);
end;
$$;

create or replace function public.admin_revoke_ticket_organizer_access(
  p_grant_id uuid,
  p_note text default null
) returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_admin uuid := auth.uid();
  v_grant public.ticket_organizer_access_grants%rowtype;
begin
  if v_admin is null or not public.is_admin() then raise exception 'Admin access required.'; end if;
  select * into v_grant from public.ticket_organizer_access_grants where id = p_grant_id for update;
  if not found then raise exception 'Organizer access grant not found.'; end if;
  if v_grant.status = 'revoked' then return jsonb_build_object('ok',true,'grant_id',v_grant.id,'status','revoked'); end if;

  update public.ticket_organizer_access_grants
  set status='revoked', revoked_at=now(), revoked_by=v_admin, revoke_note=nullif(trim(p_note),''), updated_at=now()
  where id=p_grant_id returning * into v_grant;

  return jsonb_build_object('ok',true,'grant_id',v_grant.id,'status',v_grant.status);
end;
$$;

create or replace function public.admin_list_ticket_organizer_access()
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

  update public.ticket_organizer_access_grants
  set status='expired', updated_at=now()
  where status='active' and expires_at <= now();

  select coalesce(jsonb_agg(row_data order by row_data->>'created_at' desc),'[]'::jsonb)
  into v_result
  from (
    select jsonb_build_object(
      'id',g.id,'user_id',g.user_id,'organization_name',g.organization_name,'status',g.status,
      'starts_at',g.starts_at,'expires_at',g.expires_at,'grant_note',g.grant_note,
      'revoked_at',g.revoked_at,'revoke_note',g.revoke_note,'created_at',g.created_at,
      'user',jsonb_build_object('full_name',p.full_name,'email',p.email,'phone',p.phone)
    ) row_data
    from public.ticket_organizer_access_grants g
    left join public.profiles p on p.id=g.user_id
  ) q;
  return v_result;
end;
$$;

revoke all on function public.admin_grant_ticket_organizer_access(text,text,timestamptz,text) from public, anon;
revoke all on function public.admin_extend_ticket_organizer_access(uuid,timestamptz,text) from public, anon;
revoke all on function public.admin_revoke_ticket_organizer_access(uuid,text) from public, anon;
revoke all on function public.admin_list_ticket_organizer_access() from public, anon;
grant execute on function public.admin_grant_ticket_organizer_access(text,text,timestamptz,text) to authenticated;
grant execute on function public.admin_extend_ticket_organizer_access(uuid,timestamptz,text) to authenticated;
grant execute on function public.admin_revoke_ticket_organizer_access(uuid,text) to authenticated;
grant execute on function public.admin_list_ticket_organizer_access() to authenticated;

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
set search_path = public, auth, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_grant uuid;
  v_event public.ticket_events%rowtype;
begin
  if v_user is null then raise exception 'Authentication required.'; end if;
  v_grant := public.current_ticket_organizer_grant(v_user);
  if v_grant is null then raise exception 'Temporary organizer access is required. EYA Admin must invite and activate your Organizer Workspace.'; end if;
  if nullif(trim(p_title), '') is null then raise exception 'Event title is required.'; end if;
  if nullif(trim(p_date_label), '') is null then raise exception 'Event date label is required.'; end if;
  if nullif(trim(p_venue), '') is null then raise exception 'Venue is required.'; end if;
  if nullif(trim(p_city), '') is null then raise exception 'City is required.'; end if;
  if nullif(trim(p_image_url), '') is null or nullif(trim(p_hero_image_url), '') is null then raise exception 'Card and hero images are required.'; end if;
  if p_ends_at is not null and p_starts_at is not null and p_ends_at <= p_starts_at then raise exception 'Event end time must be after the start time.'; end if;

  insert into public.ticket_events (
    title, category, description, date_label, starts_at, ends_at, venue, city,
    image_url, hero_image_url, status, organizer_id, organizer_access_grant_id, created_by
  ) values (
    trim(p_title), coalesce(nullif(trim(p_category), ''), 'Music'), nullif(trim(p_description), ''),
    trim(p_date_label), p_starts_at, p_ends_at, trim(p_venue), trim(p_city),
    trim(p_image_url), trim(p_hero_image_url), 'draft', v_user, v_grant, v_user
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
set search_path = public, auth, pg_temp
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
  if v_event.organizer_access_grant_id is null or v_event.organizer_access_grant_id is distinct from public.current_ticket_organizer_grant(v_user) then raise exception 'Your temporary Organizer Workspace is expired, revoked, or does not own this event.'; end if;
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
set search_path = public, auth, pg_temp
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
  if v_event.organizer_access_grant_id is null or v_event.organizer_access_grant_id is distinct from public.current_ticket_organizer_grant(v_user) then raise exception 'Your temporary Organizer Workspace is expired, revoked, or does not own this event.'; end if;
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
set search_path = public, auth, pg_temp
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
  if v_event.organizer_access_grant_id is null or v_event.organizer_access_grant_id is distinct from public.current_ticket_organizer_grant(v_user) then raise exception 'Your temporary Organizer Workspace is expired, revoked, or does not own this event.'; end if;
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

create or replace function public.get_my_organizer_events() returns jsonb
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
    where e.organizer_id = v_user and e.organizer_access_grant_id = v_grant
  ) q;
  return v_result;
end;
$$;

create or replace function public.get_my_organizer_event_detail(p_event_id uuid) returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_grant uuid;
  v_event public.ticket_events%rowtype;
  v_tiers jsonb;
begin
  if v_user is null then raise exception 'Authentication required.'; end if;
  v_grant := public.current_ticket_organizer_grant(v_user);
  if v_grant is null then raise exception 'Temporary Organizer Workspace access is expired or revoked.'; end if;

  select * into v_event
  from public.ticket_events
  where id = p_event_id and organizer_id = v_user and organizer_access_grant_id = v_grant;
  if not found then raise exception 'Organizer event not found for this active workspace.'; end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', t.id,'name',t.name,'description',t.description,'price_mwk',t.price_mwk,
    'capacity_total',t.capacity_total,'capacity_sold',t.capacity_sold,'capacity_reserved',t.capacity_reserved,
    'available',t.available,'sale_starts_at',t.sale_starts_at,'sale_ends_at',t.sale_ends_at,'sort_order',t.sort_order
  ) order by t.sort_order, t.created_at), '[]'::jsonb)
  into v_tiers from public.ticket_tiers t where t.event_id = p_event_id;

  return jsonb_build_object(
    'id',v_event.id,'title',v_event.title,'category',v_event.category,'description',v_event.description,
    'date_label',v_event.date_label,'starts_at',v_event.starts_at,'ends_at',v_event.ends_at,
    'venue',v_event.venue,'city',v_event.city,'image_url',v_event.image_url,'hero_image_url',v_event.hero_image_url,
    'status',v_event.status,'review_note',v_event.review_note,'submitted_at',v_event.submitted_at,
    'reviewed_at',v_event.reviewed_at,'published_at',v_event.published_at,'tiers',v_tiers
  );
end;
$$;

create or replace function public.admin_review_ticket_event(
  p_event_id uuid,
  p_action text,
  p_note text default null
) returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_admin uuid := auth.uid();
  v_event public.ticket_events%rowtype;
  v_action text := lower(trim(coalesce(p_action,'')));
  v_status text;
  v_grant_active boolean;
begin
  if v_admin is null or not public.is_admin() then raise exception 'Admin access required.'; end if;
  select * into v_event from public.ticket_events where id = p_event_id for update;
  if not found then raise exception 'Event not found.'; end if;
  if v_event.status <> 'pending_review' then raise exception 'Only pending-review events can be reviewed.'; end if;

  if v_action = 'approve' then
    if v_event.organizer_id is not null then
      select exists(
        select 1 from public.ticket_organizer_access_grants g
        where g.id=v_event.organizer_access_grant_id and g.user_id=v_event.organizer_id
          and g.status='active' and g.starts_at<=now() and g.expires_at>now()
      ) into v_grant_active;
      if not coalesce(v_grant_active,false) then raise exception 'This organizer access is expired or revoked. Renew it before publishing the event.'; end if;
    end if;
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
    status=v_status, reviewed_at=now(), reviewed_by=v_admin, review_note=nullif(trim(p_note),''),
    published_at=case when v_status='published' then now() else published_at end, updated_at=now()
  where id=p_event_id;

  insert into public.ticket_event_review_log(event_id,actor_id,action,from_status,to_status,note)
  values (p_event_id,v_admin,case when v_action='approve' then 'approved' else v_action end,v_event.status,v_status,nullif(trim(p_note),''));

  return jsonb_build_object('ok',true,'event_id',p_event_id,'status',v_status);
end;
$$;