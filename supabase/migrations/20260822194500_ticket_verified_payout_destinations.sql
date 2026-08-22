-- Organization-owned payout beneficiaries. Sensitive destination details enter
-- only as ciphertext produced by a trusted backend; client RPCs return masked data.

create table public.ticket_organization_payout_destinations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.ticket_organizer_organizations(id) on delete restrict,
  method text not null check (method in ('airtel_money','mpamba','bank')),
  beneficiary_name text not null,
  bank_or_network text not null,
  masked_destination text not null,
  destination_fingerprint text not null,
  details_ciphertext text not null,
  encryption_key_version text not null,
  status text not null default 'pending_verification'
    check (status in ('pending_verification','verified','rejected','disabled')),
  is_primary boolean not null default false,
  created_by uuid references auth.users(id) on delete set null,
  verified_by uuid references auth.users(id) on delete set null,
  verified_at timestamptz,
  rejected_by uuid references auth.users(id) on delete set null,
  rejected_at timestamptz,
  review_note text,
  disabled_by uuid references auth.users(id) on delete set null,
  disabled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id,destination_fingerprint)
);

create unique index ticket_org_payout_destinations_one_primary_idx
  on public.ticket_organization_payout_destinations(organization_id)
  where is_primary;
create index ticket_org_payout_destinations_review_idx
  on public.ticket_organization_payout_destinations(status,created_at);

create table public.ticket_organization_payout_destination_log (
  id uuid primary key default gen_random_uuid(),
  destination_id uuid not null references public.ticket_organization_payout_destinations(id) on delete restrict,
  organization_id uuid not null references public.ticket_organizer_organizations(id) on delete restrict,
  actor_id uuid references auth.users(id) on delete set null,
  action text not null,
  previous_state jsonb,
  new_state jsonb not null,
  note text,
  created_at timestamptz not null default now()
);

create index ticket_org_payout_destination_log_lookup_idx
  on public.ticket_organization_payout_destination_log(organization_id,destination_id,created_at desc);

alter table public.ticket_organization_payout_destinations enable row level security;
alter table public.ticket_organization_payout_destination_log enable row level security;
revoke all on table public.ticket_organization_payout_destinations from public,anon,authenticated;
revoke all on table public.ticket_organization_payout_destination_log from public,anon,authenticated;
grant all on table public.ticket_organization_payout_destinations to service_role;
grant all on table public.ticket_organization_payout_destination_log to service_role;

create or replace function public.register_ticket_organization_payout_destination(
  p_organization_id uuid,
  p_actor_id uuid,
  p_method text,
  p_beneficiary_name text,
  p_bank_or_network text,
  p_masked_destination text,
  p_destination_fingerprint text,
  p_details_ciphertext text,
  p_encryption_key_version text
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_method text := lower(trim(coalesce(p_method,'')));
  v_row public.ticket_organization_payout_destinations%rowtype;
begin
  if not exists (
    select 1 from public.ticket_organization_finance_entitlements f
    where f.organization_id=p_organization_id and f.user_id=p_actor_id and f.status='active'
  ) then raise exception 'Active organization finance access required.'; end if;
  if v_method not in ('airtel_money','mpamba','bank') then raise exception 'Unsupported payout method.'; end if;
  if nullif(trim(p_beneficiary_name),'') is null
     or nullif(trim(p_bank_or_network),'') is null
     or nullif(trim(p_masked_destination),'') is null
     or nullif(trim(p_destination_fingerprint),'') is null
     or nullif(trim(p_details_ciphertext),'') is null
     or nullif(trim(p_encryption_key_version),'') is null then
    raise exception 'Complete encrypted payout destination details are required.';
  end if;

  insert into public.ticket_organization_payout_destinations(
    organization_id,method,beneficiary_name,bank_or_network,masked_destination,
    destination_fingerprint,details_ciphertext,encryption_key_version,created_by
  ) values (
    p_organization_id,v_method,trim(p_beneficiary_name),trim(p_bank_or_network),trim(p_masked_destination),
    trim(p_destination_fingerprint),p_details_ciphertext,trim(p_encryption_key_version),p_actor_id
  ) returning * into v_row;

  insert into public.ticket_organization_payout_destination_log(
    destination_id,organization_id,actor_id,action,new_state,note
  ) values (
    v_row.id,v_row.organization_id,p_actor_id,'submitted',
    to_jsonb(v_row)-'details_ciphertext'-'destination_fingerprint',
    'Encrypted payout destination submitted for EYA verification.'
  );
  return jsonb_build_object('ok',true,'destination_id',v_row.id,'status',v_row.status);
end;
$$;

create or replace function public.get_my_ticket_organization_payout_destinations(p_organization_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public, auth, pg_temp
as $$
  select case
    when auth.uid() is null
      or public.current_ticket_finance_entitlement(auth.uid(),p_organization_id,true) is null
    then '[]'::jsonb
    else coalesce(jsonb_agg(jsonb_build_object(
      'id',d.id,'organization_id',d.organization_id,'method',d.method,
      'beneficiary_name',d.beneficiary_name,'bank_or_network',d.bank_or_network,
      'masked_destination',d.masked_destination,'status',d.status,'is_primary',d.is_primary,
      'verified_at',d.verified_at,'review_note',d.review_note,'created_at',d.created_at
    ) order by d.is_primary desc,d.created_at desc),'[]'::jsonb)
  end
  from public.ticket_organization_payout_destinations d
  where d.organization_id=p_organization_id
$$;

create or replace function public.admin_review_ticket_organization_payout_destination(
  p_destination_id uuid,
  p_action text,
  p_make_primary boolean default false,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_admin uuid := auth.uid();
  v_action text := lower(trim(coalesce(p_action,'')));
  v_before public.ticket_organization_payout_destinations%rowtype;
  v_after public.ticket_organization_payout_destinations%rowtype;
begin
  if v_admin is null or not public.is_admin() then raise exception 'Admin access required.'; end if;
  if v_action not in ('verify','reject','disable') then raise exception 'action must be verify, reject or disable.'; end if;
  select * into v_before from public.ticket_organization_payout_destinations where id=p_destination_id for update;
  if not found then raise exception 'Payout destination not found.'; end if;

  if v_action='verify' then
    if v_before.status <> 'pending_verification' then raise exception 'Only a pending destination can be verified.'; end if;
    if coalesce(p_make_primary,false) then
      update public.ticket_organization_payout_destinations
      set is_primary=false,updated_at=now()
      where organization_id=v_before.organization_id and is_primary=true;
    end if;
    update public.ticket_organization_payout_destinations set
      status='verified',is_primary=coalesce(p_make_primary,false),verified_by=v_admin,verified_at=now(),
      rejected_by=null,rejected_at=null,review_note=nullif(trim(p_note),''),updated_at=now()
    where id=p_destination_id returning * into v_after;
  elsif v_action='reject' then
    if v_before.status <> 'pending_verification' then raise exception 'Only a pending destination can be rejected.'; end if;
    if nullif(trim(p_note),'') is null then raise exception 'A rejection note is required.'; end if;
    update public.ticket_organization_payout_destinations set
      status='rejected',is_primary=false,rejected_by=v_admin,rejected_at=now(),review_note=trim(p_note),updated_at=now()
    where id=p_destination_id returning * into v_after;
  else
    if v_before.status <> 'verified' then raise exception 'Only a verified destination can be disabled.'; end if;
    if nullif(trim(p_note),'') is null then raise exception 'A disable note is required.'; end if;
    update public.ticket_organization_payout_destinations set
      status='disabled',is_primary=false,disabled_by=v_admin,disabled_at=now(),review_note=trim(p_note),updated_at=now()
    where id=p_destination_id returning * into v_after;
  end if;

  insert into public.ticket_organization_payout_destination_log(
    destination_id,organization_id,actor_id,action,previous_state,new_state,note
  ) values (
    v_after.id,v_after.organization_id,v_admin,v_action,
    to_jsonb(v_before)-'details_ciphertext'-'destination_fingerprint',
    to_jsonb(v_after)-'details_ciphertext'-'destination_fingerprint',nullif(trim(p_note),'')
  );
  return jsonb_build_object('ok',true,'destination_id',v_after.id,'status',v_after.status,'is_primary',v_after.is_primary);
end;
$$;

revoke all on function public.register_ticket_organization_payout_destination(uuid,uuid,text,text,text,text,text,text,text) from public,anon,authenticated;
revoke all on function public.get_my_ticket_organization_payout_destinations(uuid) from public,anon;
revoke all on function public.admin_review_ticket_organization_payout_destination(uuid,text,boolean,text) from public,anon;
grant execute on function public.register_ticket_organization_payout_destination(uuid,uuid,text,text,text,text,text,text,text) to service_role;
grant execute on function public.get_my_ticket_organization_payout_destinations(uuid) to authenticated,service_role;
grant execute on function public.admin_review_ticket_organization_payout_destination(uuid,text,boolean,text) to authenticated,service_role;
