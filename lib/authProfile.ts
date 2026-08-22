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

function buildProfilePayload(user: User) {
  const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
  const firstName = firstDefinedString(meta.first_name, meta.firstName);
  const lastName = firstDefinedString(meta.last_name, meta.lastName, meta.surname);
  const fullName =
    firstDefinedString(meta.full_name, [firstName, lastName].filter(Boolean).join(" ")) ??
    firstDefinedString(user.email?.split("@")[0]);

  return {
    full_name: fullName,
    first_name: firstName,
    last_name: lastName,
    surname: firstDefinedString(meta.surname, lastName),
    phone: firstDefinedString(meta.phone, meta.phone_number),
    onboarded: true,
  };
}

/**
 * Legacy helper retained for compatibility only.
 * Auth user metadata is user-editable and therefore MUST NOT be an authorization
 * source in production. Specialized capabilities are resolved by workspace
 * authorization, not by this value.
 */
export function getRoleFromAuthUser(_user: User | null | undefined): AppRole {
  return null;
}

export async function ensureProfileRole(
  user: User | null | undefined,
  _fallbackRole?: Exclude<AppRole, null> | null,
): Promise<AppRole> {
  if (!user) return null;

  const { data, error } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  const dbRole = error ? null : normalizeAppRole(data?.role);

  // The database profile is the authority for the legacy primary role. The
  // one-account model treats every non-Admin person as a normal User here;
  // Landlord/Food/Delivery/Ticket permissions are resolved separately.
  if (dbRole === "admin") return "admin";

  const payload = buildProfilePayload(user);
  const updateRes = await supabase.from("profiles").update(payload as never).eq("id", user.id);
  if (updateRes.error) return "student";

  return "student";
}

export async function ensureProfileRoleFromAuthUser(user: User | null | undefined): Promise<AppRole> {
  return ensureProfileRole(user);
}
