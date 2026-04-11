import type { User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { normalizeAppRole, type AppRole } from "@/lib/roleRouting";

function toNullableString(value: unknown) {
  const text = String(value ?? "").trim();
  return text ? text : null;
}

function firstDefinedString(...values: unknown[]) {
  for (const value of values) {
    const text = toNullableString(value);
    if (text) return text;
  }
  return null;
}

function buildProfilePayload(user: User, role: Exclude<AppRole, null>) {
  const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
  const firstName = firstDefinedString(meta.first_name, meta.firstName);
  const lastName = firstDefinedString(meta.last_name, meta.lastName, meta.surname);
  const fullName =
    firstDefinedString(meta.full_name, [firstName, lastName].filter(Boolean).join(" ")) ??
    firstDefinedString(user.email?.split("@")[0]);

  return {
    id: user.id,
    email: toNullableString(user.email)?.toLowerCase() ?? null,
    full_name: fullName,
    first_name: firstName,
    last_name: lastName,
    surname: firstDefinedString(meta.surname, lastName),
    phone: firstDefinedString(meta.phone, meta.phone_number),
    role,
    onboarded: true,
    updated_at: new Date().toISOString(),
  };
}

export function getRoleFromAuthUser(user: User | null | undefined): AppRole {
  if (!user) return null;
  return normalizeAppRole((user.user_metadata ?? {}).role);
}

export async function ensureProfileRole(
  user: User | null | undefined,
  fallbackRole?: Exclude<AppRole, null> | null,
): Promise<AppRole> {
  if (!user) return null;

  const authRole = getRoleFromAuthUser(user) ?? normalizeAppRole(fallbackRole);
  const { data, error } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();

  const dbRole = error ? null : normalizeAppRole(data?.role);
  if (dbRole && (!authRole || dbRole === authRole)) return dbRole;
  if (!authRole && dbRole) return dbRole;
  if (!authRole) return null;

  const payload = buildProfilePayload(user, authRole);
  const upsertRes = await supabase.from("profiles").upsert(payload as never, { onConflict: "id" });
  if (upsertRes.error) {
    const updateRes = await supabase.from("profiles").update(payload as never).eq("id", user.id);
    if (updateRes.error) return authRole;
  }

  return authRole;
}

export async function ensureProfileRoleFromAuthUser(user: User | null | undefined): Promise<AppRole> {
  return ensureProfileRole(user);
}
