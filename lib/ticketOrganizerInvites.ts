import { ENV } from "@/lib/env";
import { supabase } from "@/lib/supabase";

export type OrganizerInviteStatus = "pending" | "claimed" | "revoked" | "expired";

export type AdminOrganizerInvite = {
  id: string;
  email: string;
  organization_name: string;
  status: OrganizerInviteStatus;
  invite_expires_at: string;
  access_expires_at: string;
  admin_note: string | null;
  claimed_user_id: string | null;
  claimed_at: string | null;
  revoked_at: string | null;
  revoke_note: string | null;
  created_at: string;
};

export type CreatedOrganizerInvite = {
  ok: true;
  invite_id: string;
  email: string;
  organization_name: string;
  invite_token: string;
  invite_expires_at: string;
  access_expires_at: string;
};

export type OrganizerInvitePreview = {
  email: string;
  organization_name: string;
  invite_expires_at: string;
  access_expires_at: string;
};

function err(error: unknown, fallback: string) {
  if (error && typeof error === "object" && "message" in error) {
    const text = String((error as { message?: unknown }).message ?? "").trim();
    if (text) return text;
  }
  return fallback;
}

export function organizerInviteDeepLink(token: string) {
  return `eya://organizer-invite?t=${encodeURIComponent(token)}`;
}

export async function createAdminOrganizerInvite(input: {
  email: string;
  organizationName: string;
  accessExpiresAt: string;
  adminNote?: string | null;
  inviteHours?: number;
}) {
  const { data, error } = await supabase.rpc("admin_create_ticket_organizer_invite", {
    p_email: input.email.trim().toLowerCase(),
    p_organization_name: input.organizationName.trim(),
    p_access_expires_at: input.accessExpiresAt,
    p_admin_note: input.adminNote?.trim() || null,
    p_invite_hours: input.inviteHours ?? 72,
  });
  if (error) throw new Error(err(error, "Could not create organizer invitation."));
  if (!data?.invite_token) throw new Error("Organizer invitation token was not returned.");
  return data as CreatedOrganizerInvite;
}

export async function listAdminOrganizerInvites(): Promise<AdminOrganizerInvite[]> {
  const { data, error } = await supabase.rpc("admin_list_ticket_organizer_invites");
  if (error) throw new Error(err(error, "Could not load organizer invitations."));
  if (!Array.isArray(data)) return [];
  return data as AdminOrganizerInvite[];
}

export async function revokeAdminOrganizerInvite(inviteId: string, note?: string | null) {
  const { data, error } = await supabase.rpc("admin_revoke_ticket_organizer_invite", {
    p_invite_id: inviteId,
    p_note: note?.trim() || null,
  });
  if (error) throw new Error(err(error, "Could not revoke organizer invitation."));
  return data as { ok: true; invite_id: string; status: "revoked" };
}

async function callInviteService(body: Record<string, unknown>) {
  const base = ENV.SUPABASE_URL.replace(/\/$/, "");
  const response = await fetch(`${base}/functions/v1/ticket-organizer-invite`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data?.ok !== true) throw new Error(String(data?.error || "Organizer invitation service is unavailable."));
  return data;
}

export async function inspectOrganizerInvite(token: string): Promise<OrganizerInvitePreview> {
  const data = await callInviteService({ action: "inspect", token: token.trim() });
  return data.invite as OrganizerInvitePreview;
}

export async function claimOrganizerInvite(input: { token: string; fullName: string; password: string }) {
  const data = await callInviteService({
    action: "claim",
    token: input.token.trim(),
    full_name: input.fullName.trim(),
    password: input.password,
  });
  return data.account as { email: string; organization_name: string; access_expires_at: string };
}
