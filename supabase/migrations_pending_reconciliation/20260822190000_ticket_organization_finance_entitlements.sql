-- Finance authority is organization-owned and independent from temporary
-- Ticket Management operations access.

create table if not exists public.ticket_organization_finance_entitlements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.ticket_organizer_organizations(id) on delete restrict,
  user_id uuid not null references auth.users(id) on delete restrict,
  role text not null default 'finance_owner' check (role in ('finance_owner','finance_manager')),
  status text not null default 'active' check (status in ('active','suspended','revoked')),
  source_access_grant_id uuid references public.ticket_organizer_access_grants(id) on delete set null,
  granted_by uuid references auth.users(id) on delete set null,
  granted_at timestamptz not null default now(),
  suspended_at timestamptz,
  suspended_by uuid references auth.users(id) on delete set null,
  revoked_at timestamptz,
  revoked_by uuid references auth.users(id) on delete set null,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, user_id)
);

create index if not exists ticket_org_finance_entitlements_user_idx
  on public.ticket_organization_finance_entitlements(user_id, status, organization_id);

alter table public.ticket_organization_finance_entitlements enable row level security;
revoke all on table public.ticket_organization_finance_entitlements from public, anon, authenticated;
grant all on table public.ticket_organization_finance_entitlements to service_role;

create or replace function public.seed_first_ticket_organization_finance_owner()
returns trigger
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
begin
  if not exists (
    select 1 from public.ticket_organization_finance_entitlements f
    where f.organization_id = new.organization_id
  ) then
    insert into public.ticket_organization_finance_entitlements(
      organization_id,user_id,role,status,source_access_grant_id,granted_by,note
    ) values (
      new.organization_id,new.user_id,'finance_owner','active',new.id,new.granted_by,
      'Initial organization finance owner established from the first Ticket Management grant.'
    );
  end if;
  return new;
end;
$$;

drop trigger if exists seed_first_ticket_organization_finance_owner_trigger
on public.ticket_organizer_access_grants;
create trigger seed_first_ticket_organization_finance_owner_trigger
after insert on public.ticket_organizer_access_grants
for each row execute function public.seed_first_ticket_organization_finance_owner();

create or replace function public.current_ticket_finance_entitlement(
  p_user_id uuid,
  p_organization_id uuid,
  p_allow_suspended boolean default false
)
returns uuid
language sql
stable
security definer
set search_path = public, auth, pg_temp
as $$
  select f.id
  from public.ticket_organization_finance_entitlements f
  join public.ticket_organizer_organizations o on o.id=f.organization_id
  where f.user_id=p_user_id
    and f.organization_id=p_organization_id
    and o.status='active'
    and (f.status='active' or (p_allow_suspended and f.status='suspended'))
  order by case f.role when 'finance_owner' then 0 else 1 end, f.granted_at
  limit 1
$$;

create or replace function public.admin_set_ticket_organization_finance_entitlement(
  p_organization_id uuid,
  p_user_id uuid,
  p_role text,
  p_status text,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_admin uuid := auth.uid();
  v_role text := lower(trim(coalesce(p_role,'')));
  v_status text := lower(trim(coalesce(p_status,'')));
  v_existing public.ticket_organization_finance_entitlements%rowtype;
  v_row public.ticket_organization_finance_entitlements%rowtype;
begin
  if v_admin is null or not public.is_admin() then raise exception 'Admin access required.'; end if;
  if not exists (select 1 from public.ticket_organizer_organizations where id=p_organization_id) then
    raise exception 'Ticket organization not found.';
  end if;
  if not exists (select 1 from auth.users where id=p_user_id) then raise exception 'User not found.'; end if;
  if v_role not in ('finance_owner','finance_manager') then raise exception 'Invalid finance role.'; end if;
  if v_status not in ('active','suspended','revoked') then raise exception 'Invalid finance entitlement status.'; end if;

  select * into v_existing from public.ticket_organization_finance_entitlements
  where organization_id=p_organization_id and user_id=p_user_id for update;

  if v_status='revoked' then
    if exists (
      select 1 from public.ticket_event_payout_requests r
      where r.organization_id=p_organization_id and r.status in ('pending','approved')
    ) or exists (
      select 1 from public.ticket_event_finance_controls c
      where c.organization_id=p_organization_id and c.status <> 'settled'
    ) then
      raise exception 'Finance access cannot be revoked while organization settlement work remains open. Suspend it instead.';
    end if;
    if not exists (
      select 1 from public.ticket_organization_finance_entitlements f
      where f.organization_id=p_organization_id and f.user_id<>p_user_id and f.status='active'
    ) then
      raise exception 'Assign another active finance controller before revoking the final one.';
    end if;
  end if;

  insert into public.ticket_organization_finance_entitlements(
    organization_id,user_id,role,status,granted_by,granted_at,
    suspended_at,suspended_by,revoked_at,revoked_by,note,updated_at
  ) values (
    p_organization_id,p_user_id,v_role,v_status,v_admin,now(),
    case when v_status='suspended' then now() else null end,
    case when v_status='suspended' then v_admin else null end,
    case when v_status='revoked' then now() else null end,
    case when v_status='revoked' then v_admin else null end,
    nullif(trim(p_note),''),now()
  )
  on conflict(organization_id,user_id) do update set
    role=excluded.role,status=excluded.status,
    suspended_at=excluded.suspended_at,suspended_by=excluded.suspended_by,
    revoked_at=excluded.revoked_at,revoked_by=excluded.revoked_by,
    note=excluded.note,updated_at=now()
  returning * into v_row;

  return jsonb_build_object(
    'ok',true,'entitlement_id',v_row.id,'organization_id',v_row.organization_id,
    'user_id',v_row.user_id,'role',v_row.role,'status',v_row.status
  );
end;
$$;

revoke all on function public.seed_first_ticket_organization_finance_owner() from public, anon, authenticated;
revoke all on function public.current_ticket_finance_entitlement(uuid,uuid,boolean) from public, anon, authenticated;
revoke all on function public.admin_set_ticket_organization_finance_entitlement(uuid,uuid,text,text,text) from public, anon;
grant execute on function public.current_ticket_finance_entitlement(uuid,uuid,boolean) to service_role;
grant execute on function public.admin_set_ticket_organization_finance_entitlement(uuid,uuid,text,text,text) to authenticated, service_role;
