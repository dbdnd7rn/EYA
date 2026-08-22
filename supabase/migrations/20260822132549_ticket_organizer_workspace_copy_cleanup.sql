do $$
declare
  v_oid oid;
  v_def text;
begin
  select p.oid into v_oid
  from pg_proc p
  join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public'
    and p.prokind='f'
    and p.proname='create_my_ticket_event_draft'
  limit 1;

  if v_oid is null then raise exception 'create_my_ticket_event_draft not found'; end if;

  v_def := pg_get_functiondef(v_oid);
  v_def := replace(
    v_def,
    'Ticket Management access is required. EYA Admin must invite and activate your Organizer Workspace.',
    'Ticket Management access is required. EYA Admin must grant Ticket Management to your EYA account.'
  );
  execute v_def;
end
$$;
