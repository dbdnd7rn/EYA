create or replace function public.get_my_organizer_event_detail(p_event_id uuid) returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_user uuid := auth.uid();
  v_event public.ticket_events%rowtype;
  v_tiers jsonb;
begin
  if v_user is null then raise exception 'Authentication required.'; end if;

  select * into v_event
  from public.ticket_events
  where id = p_event_id and organizer_id = v_user;
  if not found then raise exception 'Organizer event not found.'; end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', t.id,
    'name', t.name,
    'description', t.description,
    'price_mwk', t.price_mwk,
    'capacity_total', t.capacity_total,
    'capacity_sold', t.capacity_sold,
    'capacity_reserved', t.capacity_reserved,
    'available', t.available,
    'sale_starts_at', t.sale_starts_at,
    'sale_ends_at', t.sale_ends_at,
    'sort_order', t.sort_order
  ) order by t.sort_order, t.created_at), '[]'::jsonb)
  into v_tiers
  from public.ticket_tiers t
  where t.event_id = p_event_id;

  return jsonb_build_object(
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
    'status', v_event.status,
    'review_note', v_event.review_note,
    'submitted_at', v_event.submitted_at,
    'reviewed_at', v_event.reviewed_at,
    'published_at', v_event.published_at,
    'tiers', v_tiers
  );
end;
$$;

revoke all on function public.get_my_organizer_event_detail(uuid) from public, anon;
grant execute on function public.get_my_organizer_event_detail(uuid) to authenticated;
