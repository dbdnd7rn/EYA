-- `profiles.role` is authorization data. It must never be writable from a
-- publishable-key client or derived from user-editable auth metadata.

revoke insert, update, delete, truncate on table public.profiles from authenticated;
grant update (
  full_name,
  phone,
  onboarded,
  avatar_url,
  avatar_preset,
  first_name,
  last_name,
  surname,
  campus,
  area
) on table public.profiles to authenticated;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.profiles (id, full_name, role, phone)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    'student',
    coalesce(new.raw_user_meta_data->>'phone', '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create or replace function public.handle_auth_user_profile()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
begin
  insert into public.profiles (
    id,email,full_name,first_name,last_name,surname,phone,role,onboarded
  ) values (
    new.id,
    lower(new.email),
    nullif(trim(coalesce(meta->>'full_name', concat_ws(' ', meta->>'first_name', meta->>'last_name'))), ''),
    nullif(trim(meta->>'first_name'), ''),
    nullif(trim(meta->>'last_name'), ''),
    nullif(trim(coalesce(meta->>'surname', meta->>'last_name')), ''),
    nullif(trim(meta->>'phone'), ''),
    'student',
    true
  )
  on conflict (id) do update set
    email = excluded.email,
    full_name = coalesce(excluded.full_name, public.profiles.full_name),
    first_name = coalesce(excluded.first_name, public.profiles.first_name),
    last_name = coalesce(excluded.last_name, public.profiles.last_name),
    surname = coalesce(excluded.surname, public.profiles.surname),
    phone = coalesce(excluded.phone, public.profiles.phone),
    onboarded = true;
  return new;
end;
$$;

create or replace function public.sync_auth_user_to_profile()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  first_name_val text := nullif(trim(coalesce(meta->>'first_name', '')), '');
  last_name_val text := nullif(trim(coalesce(meta->>'last_name', '')), '');
begin
  insert into public.profiles (
    id,email,full_name,first_name,last_name,surname,phone,role,onboarded
  ) values (
    new.id,
    lower(new.email),
    nullif(trim(coalesce(meta->>'full_name', concat_ws(' ', first_name_val, last_name_val))), ''),
    first_name_val,
    last_name_val,
    nullif(trim(coalesce(meta->>'surname', meta->>'last_name', '')), ''),
    nullif(trim(coalesce(meta->>'phone', '')), ''),
    'student',
    true
  )
  on conflict (id) do update set
    email = excluded.email,
    full_name = coalesce(excluded.full_name, public.profiles.full_name),
    first_name = coalesce(excluded.first_name, public.profiles.first_name),
    last_name = coalesce(excluded.last_name, public.profiles.last_name),
    surname = coalesce(excluded.surname, public.profiles.surname),
    phone = coalesce(excluded.phone, public.profiles.phone),
    onboarded = true;
  return new;
end;
$$;

revoke all on function public.handle_new_user() from public, anon, authenticated;
revoke all on function public.handle_auth_user_profile() from public, anon, authenticated;
revoke all on function public.sync_auth_user_to_profile() from public, anon, authenticated;
