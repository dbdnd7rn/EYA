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

  -- Serialize balance-changing entries for this organization so concurrent
  -- credits cannot both validate against the same outstanding balance.
  perform pg_advisory_xact_lock(hashtextextended(p_organization_id::text,0));

  if nullif(trim(coalesce(p_idempotency_key,'')),'') is not null then
    select * into v_row from public.ticket_organization_finance_ledger
    where organization_id=p_organization_id and idempotency_key=trim(p_idempotency_key);
    if found then
      if v_row.entry_type is distinct from v_type or v_row.amount_mwk is distinct from p_amount_mwk
        or v_row.memo is distinct from trim(p_memo) or v_row.event_id is distinct from p_event_id
        or v_row.reverses_entry_id is distinct from p_reverses_entry_id then
        raise exception 'Idempotency key was already used for a different ledger entry.';
      end if;
      return jsonb_build_object('ok',true,'idempotent_replay',true,'entry_id',v_row.id,'organization_id',v_row.organization_id,'entry_type',v_row.entry_type,'direction',v_row.direction,'amount_mwk',v_row.amount_mwk,'liability_balance_mwk',public.ticket_organization_liability_balance(p_organization_id));
    end if;
  end if;

  if v_type='reversal' then
    if p_reverses_entry_id is null then raise exception 'A reversal must reference the original ledger entry.'; end if;
    select * into v_original from public.ticket_organization_finance_ledger where id=p_reverses_entry_id and organization_id=p_organization_id;
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
end;
$$;

revoke all on function public.admin_post_ticket_organization_liability_entry(uuid,text,numeric,text,uuid,text,uuid,text,uuid,jsonb) from public,anon;
grant execute on function public.admin_post_ticket_organization_liability_entry(uuid,text,numeric,text,uuid,text,uuid,text,uuid,jsonb) to authenticated,service_role;
