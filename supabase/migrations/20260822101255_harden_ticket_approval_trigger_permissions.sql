alter function public.require_organizer_approval_before_publish() security definer;
alter function public.require_organizer_approval_before_publish() set search_path = public, auth, extensions, pg_temp;

revoke all on function public.require_organizer_approval_before_publish() from public, anon, authenticated;
revoke all on function public.protect_approved_ticket_event_material() from public, anon, authenticated;
revoke all on function public.protect_approved_ticket_tier_material() from public, anon, authenticated;

grant execute on function public.require_organizer_approval_before_publish() to service_role;
grant execute on function public.protect_approved_ticket_event_material() to service_role;
grant execute on function public.protect_approved_ticket_tier_material() to service_role;
