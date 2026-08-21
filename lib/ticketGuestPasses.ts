import { ENV } from "@/lib/env";
import { supabase } from "@/lib/supabase";

export type TicketGuestPassMode = "live_link" | "offline";
export type TicketGuestPassStatus = "active" | "revoked" | "used" | "expired";

export type TicketGuestPassSummary = {
  id: string;
  issued_ticket_id: string;
  event_id: string;
  mode: TicketGuestPassMode;
  status: TicketGuestPassStatus;
  guest_name: string | null;
  guest_email: string | null;
  expires_at: string;
  revoked_at: string | null;
  used_at: string | null;
  created_at: string;
  ticket_code: string;
  event_title: string;
  event_starts_at: string | null;
};

export type CreatedTicketGuestPass = {
  ok: true;
  guest_pass_id: string;
  ticket_id: string;
  mode: TicketGuestPassMode;
  status: "active";
  guest_name: string | null;
  guest_email: string | null;
  expires_at: string;
  share_token: string | null;
  offline_token: string | null;
  offline_manual_code: string | null;
  replaced_guest_pass_id: string | null;
};

function normalize(value: unknown) {
  return String(value ?? "").trim();
}

export function guestPassWebUrl(shareToken: string) {
  const token = normalize(shareToken);
  if (!token) throw new Error("Guest link token is unavailable.");
  return `${ENV.SUPABASE_URL.replace(/\/+$/, "")}/functions/v1/ticket-guest-pass#t=${encodeURIComponent(token)}`;
}

export async function createTicketGuestPass(input: {
  ticketId: string;
  mode: TicketGuestPassMode;
  guestName?: string | null;
  guestEmail?: string | null;
}): Promise<CreatedTicketGuestPass> {
  const { data, error } = await supabase.rpc("create_ticket_guest_pass", {
    p_ticket_id: input.ticketId,
    p_mode: input.mode,
    p_guest_name: normalize(input.guestName) || null,
    p_guest_email: normalize(input.guestEmail).toLowerCase() || null,
  });
  if (error) throw new Error(error.message || "Could not create guest pass.");
  if (!data?.ok) throw new Error(data?.message || "Could not create guest pass.");
  return data as CreatedTicketGuestPass;
}

export async function listMyTicketGuestPasses(): Promise<TicketGuestPassSummary[]> {
  const { data, error } = await supabase.rpc("get_my_ticket_guest_passes");
  if (error) throw new Error(error.message || "Could not load guest passes.");
  return Array.isArray(data) ? (data as TicketGuestPassSummary[]) : [];
}

export async function revokeTicketGuestPass(guestPassId: string) {
  const { data, error } = await supabase.rpc("revoke_ticket_guest_pass", {
    p_guest_pass_id: guestPassId,
  });
  if (error) throw new Error(error.message || "Could not revoke guest pass.");
  if (!data?.ok) throw new Error(data?.message || "Could not revoke guest pass.");
  return data as { ok: true; status: TicketGuestPassStatus; ticket_id?: string };
}
