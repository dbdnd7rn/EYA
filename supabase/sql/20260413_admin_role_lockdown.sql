-- Prevent self-promotion into the admin role from client-authenticated sessions.
-- Admin rows should be provisioned manually via service-role SQL or dashboard access.

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own" on public.profiles
for insert to authenticated
with check (
  (id = auth.uid() and coalesce(role, 'student') <> 'admin')
  or public.is_admin()
);

drop policy if exists "profiles_update_own_or_admin" on public.profiles;
create policy "profiles_update_own_or_admin" on public.profiles
for update to authenticated
using (
  id = auth.uid()
  or public.is_admin()
)
with check (
  (id = auth.uid() and coalesce(role, 'student') <> 'admin')
  or public.is_admin()
);
