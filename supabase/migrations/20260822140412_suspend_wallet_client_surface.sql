-- Wallet is intentionally suspended. Preserve historical data, but remove all
-- direct client access and callable wallet RPCs from anon/authenticated roles.

revoke all privileges on table public.wallet_accounts from anon, authenticated;
revoke all privileges on table public.wallet_activities from anon, authenticated;

revoke execute on function public.wallet_checkout_campus_market(uuid, text, text, text, jsonb) from public, anon, authenticated;
revoke execute on function public.wallet_set_updated_at() from public, anon, authenticated;

-- Service role remains the only application service principal allowed to maintain
-- suspended wallet data if reconciliation/audit work is ever needed.
grant select, insert, update, delete on table public.wallet_accounts to service_role;
grant select, insert, update, delete on table public.wallet_activities to service_role;
grant execute on function public.wallet_checkout_campus_market(uuid, text, text, text, jsonb) to service_role;
grant execute on function public.wallet_set_updated_at() to service_role;