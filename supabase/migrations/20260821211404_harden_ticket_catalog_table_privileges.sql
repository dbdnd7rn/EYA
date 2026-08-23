revoke all on table public.ticket_events from anon, authenticated;
revoke all on table public.ticket_tiers from anon, authenticated;

grant select on table public.ticket_events to anon, authenticated;
grant select on table public.ticket_tiers to anon, authenticated;

grant insert, update, delete on table public.ticket_events to authenticated;
grant insert, update, delete on table public.ticket_tiers to authenticated;
