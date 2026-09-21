revoke all on function public.activate_subscription(uuid, text, integer, integer)
from public, anon, authenticated;
grant execute on function public.activate_subscription(uuid, text, integer, integer)
to service_role;
alter function public.activate_subscription(uuid, text, integer, integer)
set search_path = public, pg_temp;

revoke all on function public.expire_subscriptions_and_visibility()
from public, anon, authenticated;
grant execute on function public.expire_subscriptions_and_visibility()
to service_role;
alter function public.expire_subscriptions_and_visibility()
set search_path = public, pg_temp;

revoke all on function public.sync_auth_user_to_profile()
from public, anon, authenticated;