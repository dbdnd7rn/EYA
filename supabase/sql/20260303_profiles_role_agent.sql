-- Allow `agent` as a valid role in public.profiles.role.
-- Handles both enum-backed and text-backed role columns.

do $$
declare
  role_col record;
  role_attnum smallint;
  c record;
begin
  -- Exit safely if table/column is missing in this environment.
  select
    n.nspname as schema_name,
    cls.relname as table_name,
    a.attnum as attnum,
    t.typname as type_name,
    tn.nspname as type_schema
  into role_col
  from pg_attribute a
  join pg_class cls on cls.oid = a.attrelid
  join pg_namespace n on n.oid = cls.relnamespace
  join pg_type t on t.oid = a.atttypid
  join pg_namespace tn on tn.oid = t.typnamespace
  where n.nspname = 'public'
    and cls.relname = 'profiles'
    and a.attname = 'role'
    and a.attisdropped = false;

  if role_col is null then
    raise notice 'public.profiles.role not found; skipping role migration.';
    return;
  end if;

  role_attnum := role_col.attnum;

  -- If role is enum, append enum value `agent` if needed.
  if exists (
    select 1
    from pg_type t
    where t.typname = role_col.type_name
      and t.typtype = 'e'
      and t.typnamespace = (
        select oid from pg_namespace where nspname = role_col.type_schema
      )
  ) then
    execute format('alter type %I.%I add value if not exists %L', role_col.type_schema, role_col.type_name, 'agent');
    return;
  end if;

  -- If role is text/varchar, refresh role check constraint to include agent.
  for c in
    select con.conname
    from pg_constraint con
    where con.conrelid = 'public.profiles'::regclass
      and con.contype = 'c'
      and role_attnum = any (con.conkey)
  loop
    execute format('alter table public.profiles drop constraint %I', c.conname);
  end loop;

  alter table public.profiles
    add constraint profiles_role_check
    check (role is null or role in ('student', 'landlord', 'agent', 'admin'));
end $$;
