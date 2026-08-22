import { supabase } from "@/lib/supabase";

export type TicketOrganizerAccessStatus = "active" | "expired" | "revoked";

export type MyTicketOrganizerAccess = {
  id: string;
  user_id: string;
  organization_name: string;
  status: "active";
  starts_at: string;
  expires_at: string;
  grant_note: string | null;
};

export type AdminTicketOrganizerAccess = {
  id: string;
  user_id: string;
  organization_name: string;
  status: TicketOrganizerAccessStatus;
  starts_at: string;
  expires_at: string;
  grant_note: string | null;
  revoked_at: string | null;
  revoke_note: string | null;
  created_at: string;
  user: {
    full_name: string | null;
    email: string | null;
    phone: string | null;
  } | null;
};

function errorMessage(error: unknown, fallback: string) {
  if (error && typeof error === "object" && "message" in error) {
    return String((error as { message?: unknown }).message || fallback);
  }
  return fallback;
}

export async function getMyTicketOrganizerAccess(): Promise<MyTicketOrganizerAccess | null> {
  const { data, error } = await supabase.rpc("get_my_ticket_organizer_access");
  if (error) throw new Error(errorMessage(error, "Could not check organizer access."));
  if (!data?.id) return null;
  return data as MyTicketOrganizerAccess;
}

export async function listAdminTicketOrganizerAccess(): Promise<AdminTicketOrganizerAccess[]> {
  const { data, error } = await supabase.rpc("admin_list_ticket_organizer_access");
  if (error) throw new Error(errorMessage(error, "Could not load organizer access."));
  return Array.isArray(data) ? (data as AdminTicketOrganizerAccess[]) : [];
}

export async function grantAdminTicketOrganizerAccess(input: {
  email: string;
  organizationName: string;
  expiresAt: string;
  note?: string | null;
}) {
  const { data, error } = await supabase.rpc("admin_grant_ticket_organizer_access", {
    p_email: input.email.trim(),
    p_organization_name: input.organizationName.trim(),
    p_expires_at: input.expiresAt,
    p_note: input.note?.trim() || null,
  });
  if (error) throw new Error(errorMessage(error, "Could not grant organizer access."));
  return data as { ok: true; grant_id: string; user_id: string; organization_name: string; status: "active"; starts_at: string; expires_at: string };
}

export async function extendAdminTicketOrganizerAccess(input: {
  grantId: string;
  expiresAt: string;
  note?: string | null;
}) {
  const { data, error } = await supabase.rpc("admin_extend_ticket_organizer_access", {
    p_grant_id: input.grantId,
    p_expires_at: input.expiresAt,
    p_note: input.note?.trim() || null,
  });
  if (error) throw new Error(errorMessage(error, "Could not extend organizer access."));
  return data as { ok: true; grant_id: string; status: "active"; expires_at: string };
}

export async function regrantAdminTicketOrganizerAccess(input: {
  userId: string;
  expiresAt: string;
  note?: string | null;
}) {
  const { data, error } = await supabase.rpc("admin_regrant_ticket_organizer_access", {
    p_user_id: input.userId,
    p_expires_at: input.expiresAt,
    p_note: input.note?.trim() || null,
  });
  if (error) throw new Error(errorMessage(error, "Could not re-enable organizer access."));
  return data as { ok: true; grant_id: string; user_id: string; organization_name: string; status: "active"; starts_at: string; expires_at: string };
}

export async function revokeAdminTicketOrganizerAccess(input: { grantId: string; note?: string | null }) {
  const { data, error } = await supabase.rpc("admin_revoke_ticket_organizer_access", {
    p_grant_id: input.grantId,
    p_note: input.note?.trim() || null,
  });
  if (error) throw new Error(errorMessage(error, "Could not revoke organizer access."));
  return data as { ok: true; grant_id: string; status: "revoked" };
}
