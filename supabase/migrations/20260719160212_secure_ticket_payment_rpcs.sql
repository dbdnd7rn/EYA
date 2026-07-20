begin;

revoke execute on function public.release_expired_ticket_reservations()
  from public, anon, authenticated;
revoke execute on function public.reserve_ticket_order(uuid, uuid, uuid, integer, text, text)
  from public, anon, authenticated;
revoke execute on function public.release_ticket_order(uuid, text)
  from public, anon, authenticated;
revoke execute on function public.issue_ticket_order(uuid, uuid, text, timestamptz)
  from public, anon, authenticated;

grant execute on function public.release_expired_ticket_reservations()
  to service_role;
grant execute on function public.reserve_ticket_order(uuid, uuid, uuid, integer, text, text)
  to service_role;
grant execute on function public.release_ticket_order(uuid, text)
  to service_role;
grant execute on function public.issue_ticket_order(uuid, uuid, text, timestamptz)
  to service_role;

commit;
