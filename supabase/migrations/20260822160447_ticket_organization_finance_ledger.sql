create table public.ticket_organization_finance_ledger (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.ticket_organizer_organizations(id) on delete restrict,
  event_id uuid references public.ticket_events(id) on delete restrict,
  entry_type text not null check (entry_type in ('liability_assessment','liability_repayment','liability_offset','reversal')),
  direction text not null check (direction in ('debit','credit')),
  amount_mwk numeric(14,2) not null check (amount_mwk > 0 and amount_mwk = trunc(amount_mwk)),
  memo text not null check (char_length(trim(memo)) between 3 and 500),
  source_type text,
  source_id uuid,
  idempotency_key text,
  reverses_entry_id uuid references public.ticket_organization_finance_ledger(id) on delete restrict,
  metadata jsonb not null default '{}'::jsonb,
  posted_by uuid references auth.users(id) on delete set null,
  posted_at timestamptz not null default now(),
  check (
    (entry_type='liability_assessment' and direction='debit' and reverses_entry_id is null)
    or (entry_type in ('liability_repayment','liability_offset') and direction='credit' and reverses_entry_id is null)
    or (entry_type='reversal' and reverses_entry_id is not null)
  )
);

create index ticket_org_finance_ledger_org_idx on public.ticket_organization_finance_ledger(organization_id,posted_at desc,id desc);
create index ticket_org_finance_ledger_event_idx on public.ticket_organization_finance_ledger(event_id,posted_at desc) where event_id is not null;
create unique index ticket_org_finance_ledger_idempotency_idx on public.ticket_organization_finance_ledger(organization_id,idempotency_key) where idempotency_key is not null;
create unique index ticket_org_finance_ledger_one_reversal_idx on public.ticket_organization_finance_ledger(reverses_entry_id) where reverses_entry_id is not null;

alter table public.ticket_organization_finance_ledger enable row level security;
revoke all on table public.ticket_organization_finance_ledger from public,anon,authenticated;
grant select,insert on table public.ticket_organization_finance_ledger to service_role;

create or replace function public.prevent_ticket_organization_finance_ledger_mutation()
returns trigger language plpgsql security definer set search_path=public,auth,pg_temp as $$
begin
  raise exception 'Finance ledger entries are immutable. Post a reversal entry instead.';
end;
$$;

create trigger prevent_ticket_org_finance_ledger_update_delete
before update or delete on public.ticket_organization_finance_ledger
for each row execute function public.prevent_ticket_organization_finance_ledger_mutation();

create or replace function public.ticket_organization_liability_balance(p_organization_id uuid)
returns numeric language sql stable security definer set search_path=public,auth,pg_temp as $$
  select greatest(coalesce(sum(case when direction='debit' then amount_mwk else -amount_mwk end),0),0)
  from public.ticket_organization_finance_ledger where organization_id=p_organization_id
$$;

create or replace function public.admin_post_ticket_organization_liability_entry(
  p_organization_id uuid,
  p_entry_type text,
  p_amount_mwk numeric,
  p_memo text,
  p_event_id uuid default null,
  p_source_type text default null,
  p_source_id uuid default null,
  p_idempotency_key text default null,
  p_reverses_entry_id uuid default null,
  p_metadata jsonb default '{}'::jsonb
) returns jsonb language plpgsql security definer set search_path=public,auth,pg_temp as $$
declare
  v_admin uuid:=auth.uid();
  v_type text:=lower(trim(coalesce(p_entry_type,'')));
  v_direction text;
  v_amount numeric(14,2):=p_amount_mwk;
  v_current numeric(14,2);
  v_original public.ticket_organization_finance_ledger%rowtype;
  v_row public.ticket_organization_finance_ledger%rowtype;
begin
  if v_admin is null or not public.is_admin() then raise exception 'Admin access required.'; end if;
  if not exists(select 1 from public.ticket_organizer_organizations where id=p_organization_id) then raise exception 'Ticket organization not found.'; end if;
  if p_event_id is not null and not exists(select 1 from public.ticket_events where id=p_event_id and organization_id=p_organization_id) then raise exception 'Event does not belong to this organization.'; end if;
  if nullif(trim(coalesce(p_memo,'')),'') is null or char_length(trim(p_memo)) not between 3 and 500 then raise exception 'A finance memo between 3 and 500 characters is required.'; end if;
  if nullif(trim(coalesce(p_idempotency_key,'')),'') is not null and char_length(trim(p_idempotency_key))>120 then raise exception 'Idempotency key is too long.'; end if;

  if v_type='reversal' then
    if p_reverses_entry_id is null then raise exception 'A reversal must reference the original ledger entry.'; end if;
    select * into v_original from public.ticket_organization_finance_ledger where id=p_reverses_entry_id and organization_id=p_organization_id for share;
    if not found then raise exception 'Original ledger entry not found.'; end if;
    if v_original.entry_type='reversal' then raise exception 'A reversal entry cannot itself be reversed.'; end if;
    if exists(select 1 from public.ticket_organization_finance_ledger where reverses_entry_id=p_reverses_entry_id) then raise exception 'This ledger entry is already reversed.'; end if;
    v_amount:=v_original.amount_mwk;
    v_direction:=case v_original.direction when 'debit' then 'credit' else 'debit' end;
    if p_event_id is not null and p_event_id is distinct from v_original.event_id then raise exception 'Reversal event must match the original entry.'; end if;
  elsif v_type='liability_assessment' then
    if p_reverses_entry_id is not null then raise exception 'Only reversal entries may reference an original entry.'; end if;
    v_direction:='debit';
  elsif v_type in ('liability_repayment','liability_offset') then
    if p_reverses_entry_id is not null then raise exception 'Only reversal entries may reference an original entry.'; end if;
    v_direction:='credit';
  else
    raise exception 'Unsupported liability ledger entry type.';
  end if;

  if v_amount is null or v_amount<=0 or v_amount<>trunc(v_amount) then raise exception 'Amount must be a whole-MWK value greater than zero.'; end if;
  v_current:=public.ticket_organization_liability_balance(p_organization_id);
  if v_direction='credit' and v_amount>v_current then raise exception 'Credit exceeds the outstanding organization liability.'; end if;

  insert into public.ticket_organization_finance_ledger(
    organization_id,event_id,entry_type,direction,amount_mwk,memo,source_type,source_id,idempotency_key,reverses_entry_id,metadata,posted_by
  ) values (
    p_organization_id,coalesce(p_event_id,v_original.event_id),v_type,v_direction,v_amount,trim(p_memo),
    nullif(trim(coalesce(p_source_type,'')),''),p_source_id,nullif(trim(coalesce(p_idempotency_key,'')),''),
    p_reverses_entry_id,coalesce(p_metadata,'{}'::jsonb),v_admin
  ) returning * into v_row;

  return jsonb_build_object('ok',true,'entry_id',v_row.id,'organization_id',v_row.organization_id,'entry_type',v_row.entry_type,'direction',v_row.direction,'amount_mwk',v_row.amount_mwk,'liability_balance_mwk',public.ticket_organization_liability_balance(p_organization_id));
exception when unique_violation then
  if nullif(trim(coalesce(p_idempotency_key,'')),'') is not null then
    select * into v_row from public.ticket_organization_finance_ledger where organization_id=p_organization_id and idempotency_key=trim(p_idempotency_key);
    return jsonb_build_object('ok',true,'idempotent_replay',true,'entry_id',v_row.id,'organization_id',v_row.organization_id,'entry_type',v_row.entry_type,'direction',v_row.direction,'amount_mwk',v_row.amount_mwk,'liability_balance_mwk',public.ticket_organization_liability_balance(p_organization_id));
  end if;
  raise;
end;
$$;

create or replace function public.get_ticket_organization_finance_ledger(p_organization_id uuid,p_limit integer default 100)
returns jsonb language plpgsql security definer set search_path=public,auth,pg_temp as $$
declare v_user uuid:=auth.uid(); v_rows jsonb;
begin
  if v_user is null then raise exception 'Authentication required.'; end if;
  if not public.is_admin() and public.current_ticket_finance_entitlement(v_user,p_organization_id,true) is null then raise exception 'Organization finance access required.'; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',x.id,'event_id',x.event_id,'entry_type',x.entry_type,'direction',x.direction,'amount_mwk',x.amount_mwk,
    'memo',x.memo,'source_type',x.source_type,'source_id',x.source_id,'reverses_entry_id',x.reverses_entry_id,
    'posted_by',x.posted_by,'posted_at',x.posted_at
  ) order by x.posted_at desc,x.id desc),'[]'::jsonb) into v_rows
  from (select * from public.ticket_organization_finance_ledger where organization_id=p_organization_id order by posted_at desc,id desc limit greatest(1,least(coalesce(p_limit,100),200))) x;
  return jsonb_build_object('organization_id',p_organization_id,'liability_balance_mwk',public.ticket_organization_liability_balance(p_organization_id),'entries',v_rows);
end;
$$;

revoke all on function public.prevent_ticket_organization_finance_ledger_mutation() from public,anon,authenticated;
revoke all on function public.ticket_organization_liability_balance(uuid) from public,anon,authenticated;
revoke all on function public.admin_post_ticket_organization_liability_entry(uuid,text,numeric,text,uuid,text,uuid,text,uuid,jsonb) from public,anon;
revoke all on function public.get_ticket_organization_finance_ledger(uuid,integer) from public,anon;
grant execute on function public.ticket_organization_liability_balance(uuid) to service_role;
grant execute on function public.admin_post_ticket_organization_liability_entry(uuid,text,numeric,text,uuid,text,uuid,text,uuid,jsonb) to authenticated,service_role;
grant execute on function public.get_ticket_organization_finance_ledger(uuid,integer) to authenticated,service_role;
