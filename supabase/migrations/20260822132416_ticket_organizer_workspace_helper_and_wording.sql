create or replace function public.current_ticket_organizer_organization(p_user_id uuid)
returns uuid
language sql
stable
security definer
set search_path to 'public', 'auth', 'pg_temp'
as $$
  select g.organization_id
  from public.ticket_organizer_access_grants g
  join public.ticket_organizer_organizations o on o.id = g.organization_id
  where g.user_id = p_user_id
    and o.status = 'active'
    and g.status = 'active'
    and g.starts_at <= now()
    and g.expires_at > now()
  order by g.expires_at desc, g.created_at desc
  limit 1;
$$;

-- Keep existing RPC behavior intact; only update retired temporary-account wording.
do $$
declare
  r record;
  v_def text;
begin
  for r in
    select p.oid
    from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public'
      and p.prokind='f'
      and p.proname in (
        'cancel_my_ticket_event_payout_request',
        'create_my_ticket_event_draft',
        'get_my_organizer_event_detail',
        'get_my_ticket_event_finance',
        'get_my_ticket_event_revision',
        'remove_my_ticket_event_revision_tier',
        'request_my_ticket_event_payout',
        'start_my_ticket_event_revision',
        'submit_my_ticket_event',
        'submit_my_ticket_event_revision',
        'update_my_ticket_event_draft',
        'update_my_ticket_event_revision',
        'upsert_my_ticket_event_revision_tier',
        'upsert_my_ticket_tier'
      )
  loop
    v_def := pg_get_functiondef(r.oid);
    v_def := replace(v_def, 'Temporary Organizer Workspace access is expired or revoked.', 'Ticket Management access is expired or revoked.');
    v_def := replace(v_def, 'Your temporary Organizer Workspace is expired or revoked.', 'Your Ticket Management access is expired or revoked.');
    v_def := replace(v_def, 'Temporary organizer access is required.', 'Ticket Management access is required.');
    execute v_def;
  end loop;
end
$$;
