create table if not exists public.vac_callback_nonces (
  nonce uuid primary key,
  received_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create index if not exists vac_callback_nonces_expires_idx on public.vac_callback_nonces(expires_at);

alter table public.vac_callback_nonces enable row level security;
revoke all on table public.vac_callback_nonces from public, anon, authenticated;
grant select, insert, delete on table public.vac_callback_nonces to service_role;

create or replace function public.claim_vac_callback_nonce(p_nonce uuid, p_expires_at timestamptz)
returns void
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
begin
  if p_nonce is null then raise exception 'VAC callback nonce is required.'; end if;
  if p_expires_at is null or p_expires_at <= now() or p_expires_at > now() + interval '10 minutes' then
    raise exception 'VAC callback nonce expiry is invalid.';
  end if;

  delete from public.vac_callback_nonces where expires_at <= now();

  begin
    insert into public.vac_callback_nonces(nonce, expires_at) values (p_nonce, p_expires_at);
  exception when unique_violation then
    raise exception 'VAC callback nonce has already been used.';
  end;
end;
$$;

revoke all on function public.claim_vac_callback_nonce(uuid,timestamptz) from public, anon, authenticated;
grant execute on function public.claim_vac_callback_nonce(uuid,timestamptz) to service_role;
