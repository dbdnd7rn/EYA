alter function public.is_admin() set search_path = public, auth, pg_temp;

revoke execute on function public.ticket_transfer_guest_guard() from public, anon, authenticated;
