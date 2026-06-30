-- Ensure existing role application deployments have the table privileges
-- required for authenticated users and admins under RLS.

grant select, insert, update on public.role_applications to authenticated;
grant all on public.role_applications to service_role;
