alter function public.wallet_set_updated_at() set search_path = public, auth, pg_temp;
alter function public.set_updated_at() set search_path = public, auth, pg_temp;
alter function public.set_updated_at_column() set search_path = public, auth, pg_temp;
alter function public.food_order_room_label(public.orders) set search_path = public, auth, pg_temp;
