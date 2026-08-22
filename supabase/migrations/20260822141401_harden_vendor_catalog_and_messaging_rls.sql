-- Secure live Food/Marketplace vendor and messaging tables.
-- Public discovery remains read-only for active vendors/items.

alter table public.vendors enable row level security;
alter table public.catalog_items enable row level security;
alter table public.vendor_conversations enable row level security;
alter table public.vendor_messages enable row level security;

revoke all privileges on table public.vendors from anon, authenticated;
revoke all privileges on table public.catalog_items from anon, authenticated;
revoke all privileges on table public.vendor_conversations from anon, authenticated;
revoke all privileges on table public.vendor_messages from anon, authenticated;

grant select on table public.vendors to anon, authenticated;
grant insert, update, delete on table public.vendors to authenticated;

grant select on table public.catalog_items to anon, authenticated;
grant insert, update, delete on table public.catalog_items to authenticated;

grant select, insert on table public.vendor_conversations to authenticated;
grant update (subject, last_message_at, updated_at) on table public.vendor_conversations to authenticated;

grant select, insert on table public.vendor_messages to authenticated;

-- Vendors: public can discover active vendors; owner/Admin manages records.
drop policy if exists vendors_select_visible on public.vendors;
create policy vendors_select_visible on public.vendors
for select to anon, authenticated
using (
  is_active = true
  or owner_id = auth.uid()
  or public.is_admin()
);

drop policy if exists vendors_insert_owner_or_admin on public.vendors;
create policy vendors_insert_owner_or_admin on public.vendors
for insert to authenticated
with check (owner_id = auth.uid() or public.is_admin());

drop policy if exists vendors_update_owner_or_admin on public.vendors;
create policy vendors_update_owner_or_admin on public.vendors
for update to authenticated
using (owner_id = auth.uid() or public.is_admin())
with check (owner_id = auth.uid() or public.is_admin());

drop policy if exists vendors_delete_owner_or_admin on public.vendors;
create policy vendors_delete_owner_or_admin on public.vendors
for delete to authenticated
using (owner_id = auth.uid() or public.is_admin());

-- Catalog: public sees only active items for active vendors. Vendor owner/Admin manages.
drop policy if exists catalog_items_select_visible on public.catalog_items;
create policy catalog_items_select_visible on public.catalog_items
for select to anon, authenticated
using (
  (
    is_active = true
    and exists (
      select 1 from public.vendors v
      where v.id = catalog_items.vendor_id and v.is_active = true
    )
  )
  or exists (
    select 1 from public.vendors v
    where v.id = catalog_items.vendor_id and v.owner_id = auth.uid()
  )
  or public.is_admin()
);

drop policy if exists catalog_items_insert_owner_or_admin on public.catalog_items;
create policy catalog_items_insert_owner_or_admin on public.catalog_items
for insert to authenticated
with check (
  exists (select 1 from public.vendors v where v.id = catalog_items.vendor_id and v.owner_id = auth.uid())
  or public.is_admin()
);

drop policy if exists catalog_items_update_owner_or_admin on public.catalog_items;
create policy catalog_items_update_owner_or_admin on public.catalog_items
for update to authenticated
using (
  exists (select 1 from public.vendors v where v.id = catalog_items.vendor_id and v.owner_id = auth.uid())
  or public.is_admin()
)
with check (
  exists (select 1 from public.vendors v where v.id = catalog_items.vendor_id and v.owner_id = auth.uid())
  or public.is_admin()
);

drop policy if exists catalog_items_delete_owner_or_admin on public.catalog_items;
create policy catalog_items_delete_owner_or_admin on public.catalog_items
for delete to authenticated
using (
  exists (select 1 from public.vendors v where v.id = catalog_items.vendor_id and v.owner_id = auth.uid())
  or public.is_admin()
);

-- Conversations: only customer/vendor owner/Admin can read. A customer can start
-- their own conversation. A vendor may start one only for a customer who has an
-- existing order with that vendor.
drop policy if exists vendor_conversations_select_participant on public.vendor_conversations;
create policy vendor_conversations_select_participant on public.vendor_conversations
for select to authenticated
using (
  customer_id = auth.uid()
  or exists (select 1 from public.vendors v where v.id = vendor_conversations.vendor_id and v.owner_id = auth.uid())
  or public.is_admin()
);

drop policy if exists vendor_conversations_insert_participant on public.vendor_conversations;
create policy vendor_conversations_insert_participant on public.vendor_conversations
for insert to authenticated
with check (
  customer_id = auth.uid()
  or (
    exists (select 1 from public.vendors v where v.id = vendor_conversations.vendor_id and v.owner_id = auth.uid())
    and exists (
      select 1 from public.orders o
      where o.vendor_id = vendor_conversations.vendor_id
        and o.customer_id = vendor_conversations.customer_id
    )
  )
  or public.is_admin()
);

drop policy if exists vendor_conversations_update_participant on public.vendor_conversations;
create policy vendor_conversations_update_participant on public.vendor_conversations
for update to authenticated
using (
  customer_id = auth.uid()
  or exists (select 1 from public.vendors v where v.id = vendor_conversations.vendor_id and v.owner_id = auth.uid())
  or public.is_admin()
)
with check (
  customer_id = auth.uid()
  or exists (select 1 from public.vendors v where v.id = vendor_conversations.vendor_id and v.owner_id = auth.uid())
  or public.is_admin()
);

-- Messages: sender must be current user, receiver must be the actual counterpart
-- in the referenced conversation. No client UPDATE/DELETE privileges are granted.
drop policy if exists vendor_messages_select_participant on public.vendor_messages;
create policy vendor_messages_select_participant on public.vendor_messages
for select to authenticated
using (
  exists (
    select 1
    from public.vendor_conversations c
    join public.vendors v on v.id = c.vendor_id
    where c.id = vendor_messages.conversation_id
      and (c.customer_id = auth.uid() or v.owner_id = auth.uid())
  )
  or public.is_admin()
);

drop policy if exists vendor_messages_insert_valid_counterpart on public.vendor_messages;
create policy vendor_messages_insert_valid_counterpart on public.vendor_messages
for insert to authenticated
with check (
  sender_id = auth.uid()
  and exists (
    select 1
    from public.vendor_conversations c
    join public.vendors v on v.id = c.vendor_id
    where c.id = vendor_messages.conversation_id
      and (
        (c.customer_id = auth.uid() and vendor_messages.receiver_id = v.owner_id)
        or (v.owner_id = auth.uid() and vendor_messages.receiver_id = c.customer_id)
      )
  )
);

-- Trigger helper should not be a public RPC and should use a fixed search path.
alter function public.touch_vendor_conversation() set search_path = 'public', 'pg_temp';
revoke execute on function public.touch_vendor_conversation() from public, anon, authenticated;
grant execute on function public.touch_vendor_conversation() to service_role;