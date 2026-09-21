alter table public.ticket_event_payout_requests
  add column payout_destination_id uuid
  references public.ticket_organization_payout_destinations(id) on delete restrict;

create index ticket_event_payout_requests_destination_idx
  on public.ticket_event_payout_requests(payout_destination_id,requested_at desc);

create or replace function public.bind_ticket_payout_request_destination()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_destination public.ticket_organization_payout_destinations%rowtype;
begin
  if new.payout_destination_id is null then
    select * into v_destination
    from public.ticket_organization_payout_destinations d
    where d.organization_id=new.organization_id and d.status='verified' and d.is_primary=true
    for share;
  else
    select * into v_destination
    from public.ticket_organization_payout_destinations d
    where d.id=new.payout_destination_id and d.organization_id=new.organization_id
      and d.status='verified' and d.is_primary=true
    for share;
  end if;
  if not found then raise exception 'A verified primary organization payout destination is required.'; end if;
  new.payout_destination_id := v_destination.id;
  new.metadata := coalesce(new.metadata,'{}'::jsonb) || jsonb_build_object(
    'payout_destination_snapshot',jsonb_build_object(
      'id',v_destination.id,'method',v_destination.method,
      'beneficiary_name',v_destination.beneficiary_name,
      'bank_or_network',v_destination.bank_or_network,
      'masked_destination',v_destination.masked_destination,
      'verified_at',v_destination.verified_at
    )
  );
  return new;
end;
$$;

create or replace function public.revalidate_ticket_payout_destination_before_paid()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.status='paid' and old.status is distinct from 'paid' then
    if new.payout_destination_id is null or not exists (
      select 1 from public.ticket_organization_payout_destinations d
      where d.id=new.payout_destination_id and d.organization_id=new.organization_id
        and d.status='verified'
    ) then
      raise exception 'The bound payout destination is no longer verified.';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists bind_ticket_payout_request_destination_trigger on public.ticket_event_payout_requests;
create trigger bind_ticket_payout_request_destination_trigger
before insert on public.ticket_event_payout_requests
for each row execute function public.bind_ticket_payout_request_destination();

drop trigger if exists revalidate_ticket_payout_destination_before_paid_trigger on public.ticket_event_payout_requests;
create trigger revalidate_ticket_payout_destination_before_paid_trigger
before update of status on public.ticket_event_payout_requests
for each row execute function public.revalidate_ticket_payout_destination_before_paid();

revoke all on function public.bind_ticket_payout_request_destination() from public,anon,authenticated;
revoke all on function public.revalidate_ticket_payout_destination_before_paid() from public,anon,authenticated;
