create or replace function public.current_ticket_organizer_grant(p_user_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public, auth, pg_temp
as $$
  select g.id
  from public.ticket_organizer_access_grants g
  join auth.users u on u.id = g.user_id
  where g.user_id = p_user_id
    and coalesce(u.raw_app_meta_data->>'eya_account_type','') = 'temporary_organizer'
    and g.status = 'active'
    and g.starts_at <= now()
    and g.expires_at > now()
  order by g.expires_at desc, g.created_at desc
  limit 1;
$$;

revoke all on function public.current_ticket_organizer_grant(uuid) from public, anon, authenticated;

-- Legacy path from the pre-invite design: normal authenticated EYA accounts can
-- no longer be converted into organizers by calling the old grant RPC.
revoke execute on function public.admin_grant_ticket_organizer_access(text,text,timestamptz,text) from authenticated;
