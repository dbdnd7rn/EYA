begin;

alter table if exists public.notifications
  add column if not exists data jsonb not null default '{}'::jsonb;

alter table if exists public.notifications
  add column if not exists priority text not null default 'normal';

alter table if exists public.notifications
  add column if not exists read_at timestamp with time zone;

alter table if exists public.notifications
  add column if not exists pushed_at timestamp with time zone;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'notifications'
      and column_name = 'priority'
  ) then
    update public.notifications
    set priority = case
      when type in (
        'payment_success',
        'payment_failed',
        'delivery_assigned',
        'delivery_status_changed',
        'vendor_message',
        'wallet_transfer_received',
        'wallet_request',
        'support_ticket_updated',
        'trust_report_created',
        'trust_report_updated'
      ) then 'important'
      else 'normal'
    end
    where priority is null or priority = '';
  end if;
end $$;

create index if not exists idx_notifications_user_unread_created_at
  on public.notifications(user_id, is_read, created_at desc);

create index if not exists idx_notifications_user_priority_created_at
  on public.notifications(user_id, priority, created_at desc);

commit;
