alter table public.ticket_organizer_access_grants
  drop constraint if exists ticket_organizer_access_grants_user_id_fkey;

alter table public.ticket_organizer_access_grants
  add constraint ticket_organizer_access_grants_user_id_fkey
  foreign key (user_id) references auth.users(id) on delete restrict;
