-- Phase 1 security hardening: notifications and obviously non-anonymous RPCs.
-- Preserve current authenticated notification creation temporarily while callers
-- are migrated to server-validated notification primitives.

alter table public.notifications enable row level security;

revoke all privileges on table public.notifications from anon, authenticated;
grant select, insert on table public.notifications to authenticated;
grant update (is_read, read_at) on table public.notifications to authenticated;

drop policy if exists notifications_select_own_or_admin on public.notifications;
create policy notifications_select_own_or_admin
on public.notifications
for select
to authenticated
using (user_id = auth.uid() or public.is_admin());

drop policy if exists notifications_insert_authenticated_compat on public.notifications;
create policy notifications_insert_authenticated_compat
on public.notifications
for insert
to authenticated
with check (auth.uid() is not null);

drop policy if exists notifications_update_read_state_own_or_admin on public.notifications;
create policy notifications_update_read_state_own_or_admin
on public.notifications
for update
to authenticated
using (user_id = auth.uid() or public.is_admin())
with check (user_id = auth.uid() or public.is_admin());

-- These RPCs must never be callable anonymously. Their authenticated callers
-- still face server-side ownership/Admin checks inside the function.
revoke execute on function public.admin_broadcast_notification(text, text, text, text, text) from public, anon;
grant execute on function public.admin_broadcast_notification(text, text, text, text, text) to authenticated, service_role;

revoke execute on function public.approve_food_order_payment(uuid, text) from public, anon;
grant execute on function public.approve_food_order_payment(uuid, text) to authenticated, service_role;

revoke execute on function public.release_food_order_to_riders(uuid) from public, anon;
grant execute on function public.release_food_order_to_riders(uuid) to authenticated, service_role;

-- Trigger-only helpers do not need PostgREST execution rights.
revoke execute on function public.notify_food_provider_on_new_order() from public, anon, authenticated;
grant execute on function public.notify_food_provider_on_new_order() to service_role;

revoke execute on function public.handle_auth_user_profile() from public, anon, authenticated;
grant execute on function public.handle_auth_user_profile() to service_role;

revoke execute on function public.handle_new_user() from public, anon, authenticated;
grant execute on function public.handle_new_user() to service_role;