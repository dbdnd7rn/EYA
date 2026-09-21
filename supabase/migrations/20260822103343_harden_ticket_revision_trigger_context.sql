alter function public.protect_approved_ticket_event_material() security definer;
alter function public.protect_approved_ticket_event_material() set search_path = public, auth, pg_temp;
alter function public.protect_approved_ticket_tier_material() security definer;
alter function public.protect_approved_ticket_tier_material() set search_path = public, auth, pg_temp;

revoke all on function public.protect_approved_ticket_event_material() from public, anon, authenticated;
revoke all on function public.protect_approved_ticket_tier_material() from public, anon, authenticated;
grant execute on function public.protect_approved_ticket_event_material() to service_role, postgres;
grant execute on function public.protect_approved_ticket_tier_material() to service_role, postgres;
