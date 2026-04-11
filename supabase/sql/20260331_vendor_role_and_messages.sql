alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles
  add constraint profiles_role_check check (role in ('student', 'landlord', 'agent', 'vendor', 'admin'));

create table if not exists campus_market.vendor_conversations (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references campus_market.vendors(id) on delete cascade,
  customer_id uuid not null references auth.users(id) on delete cascade,
  channel campus_market.channel not null,
  catalog_item_id uuid references campus_market.catalog_items(id) on delete set null,
  subject text,
  last_message_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_vendor_conversations_vendor_id on campus_market.vendor_conversations(vendor_id, last_message_at desc);
create index if not exists idx_vendor_conversations_customer_id on campus_market.vendor_conversations(customer_id, last_message_at desc);

create table if not exists campus_market.vendor_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references campus_market.vendor_conversations(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete cascade,
  receiver_id uuid not null references auth.users(id) on delete cascade,
  sender_role text not null check (sender_role in ('customer', 'vendor', 'admin')),
  receiver_role text not null check (receiver_role in ('customer', 'vendor', 'admin')),
  content text,
  message_type text not null default 'text' check (message_type in ('text', 'image')),
  image_url text,
  created_at timestamptz not null default now()
);

create index if not exists idx_vendor_messages_conversation_id on campus_market.vendor_messages(conversation_id, created_at asc);

create or replace function campus_market.touch_vendor_conversation()
returns trigger
language plpgsql
as $$
begin
  update campus_market.vendor_conversations
  set last_message_at = new.created_at,
      updated_at = now()
  where id = new.conversation_id;
  return new;
end;
$$;

drop trigger if exists trg_vendor_messages_touch_conversation on campus_market.vendor_messages;
create trigger trg_vendor_messages_touch_conversation
after insert on campus_market.vendor_messages
for each row execute function campus_market.touch_vendor_conversation();

alter table campus_market.vendor_conversations enable row level security;
alter table campus_market.vendor_messages enable row level security;

drop policy if exists "vendor_conversations_select_participants" on campus_market.vendor_conversations;
create policy "vendor_conversations_select_participants" on campus_market.vendor_conversations
for select to authenticated
using (
  customer_id = auth.uid()
  or exists (
    select 1 from campus_market.vendors v
    where v.id = vendor_conversations.vendor_id and v.owner_id = auth.uid()
  )
);

drop policy if exists "vendor_conversations_insert_customer_or_vendor" on campus_market.vendor_conversations;
create policy "vendor_conversations_insert_customer_or_vendor" on campus_market.vendor_conversations
for insert to authenticated
with check (
  customer_id = auth.uid()
  or exists (
    select 1 from campus_market.vendors v
    where v.id = vendor_conversations.vendor_id and v.owner_id = auth.uid()
  )
);

drop policy if exists "vendor_messages_select_participants" on campus_market.vendor_messages;
create policy "vendor_messages_select_participants" on campus_market.vendor_messages
for select to authenticated
using (
  exists (
    select 1
    from campus_market.vendor_conversations c
    left join campus_market.vendors v on v.id = c.vendor_id
    where c.id = vendor_messages.conversation_id
      and (c.customer_id = auth.uid() or v.owner_id = auth.uid())
  )
);

drop policy if exists "vendor_messages_insert_participants" on campus_market.vendor_messages;
create policy "vendor_messages_insert_participants" on campus_market.vendor_messages
for insert to authenticated
with check (
  sender_id = auth.uid()
  and exists (
    select 1
    from campus_market.vendor_conversations c
    left join campus_market.vendors v on v.id = c.vendor_id
    where c.id = vendor_messages.conversation_id
      and (c.customer_id = auth.uid() or v.owner_id = auth.uid())
  )
);

grant select, insert on campus_market.vendor_conversations to authenticated;
grant select, insert on campus_market.vendor_messages to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'campus_market'
      and tablename = 'vendor_messages'
  ) then
    alter publication supabase_realtime add table campus_market.vendor_messages;
  end if;
end $$;
