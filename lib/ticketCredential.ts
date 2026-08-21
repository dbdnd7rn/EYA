import { supabase } from "@/lib/supabase";
import type { IssuedTicket } from "@/lib/tickets";

export const LIVE_TICKET_QR_KIND = "eya_live_ticket" as const;
export const LIVE_TICKET_QR_VERSION = 2 as const;
export const LIVE_TICKET_TOKEN_PREFIX = "EYA-LIVE-2-";
export const LIVE_TICKET_MANUAL_PREFIX = "LIVE-";

export type LiveTicketCredential = {
  version: typeof LIVE_TICKET_QR_VERSION;
  kind: typeof LIVE_TICKET_QR_KIND;
  token: string;
  manual_code: string;
  issued_at: string;
  expires_at: string;
  refresh_after_seconds: number;
  ttl_seconds: number;
  generation: number;
};

function normalize(value: unknown) {
  return String(value ?? "").trim();
}

export function canPresentTicketQr(ticket: Pick<IssuedTicket, "status" | "checked_in_at">) {
  return String(ticket.status || "").toLowerCase() === "active" && !ticket.checked_in_at;
}

export function isLiveTicketQrToken(value: unknown) {
  return normalize(value).toUpperCase().startsWith(LIVE_TICKET_TOKEN_PREFIX);
}

export function isLiveTicketManualCode(value: unknown) {
  return normalize(value).toUpperCase().startsWith(LIVE_TICKET_MANUAL_PREFIX);
}

export function normalizeLiveTicketQrToken(value: unknown) {
  const raw = normalize(value).toUpperCase();
  return raw.startsWith(LIVE_TICKET_TOKEN_PREFIX) ? raw : "";
}

export function normalizeLiveTicketManualCode(value: unknown) {
  const raw = normalize(value).toUpperCase();
  return raw.startsWith(LIVE_TICKET_MANUAL_PREFIX) ? raw : "";
}

export function liveCredentialSecondsRemaining(credential: LiveTicketCredential | null | undefined, now = Date.now()) {
  if (!credential?.expires_at) return 0;
  const expiresAt = Date.parse(credential.expires_at);
  if (!Number.isFinite(expiresAt)) return 0;
  return Math.max(0, Math.ceil((expiresAt - now) / 1000));
}

function normalizeCredential(value: any): LiveTicketCredential {
  const credential = value && typeof value === "object" ? value : {};
  const token = normalizeLiveTicketQrToken(credential.token);
  const manualCode = normalizeLiveTicketManualCode(credential.manual_code);
  const expiresAt = normalize(credential.expires_at);
  const issuedAt = normalize(credential.issued_at);

  if (!token || !manualCode || !expiresAt || !issuedAt) {
    throw new Error("Live ticket credential is incomplete.");
  }

  return {
    version: LIVE_TICKET_QR_VERSION,
    kind: LIVE_TICKET_QR_KIND,
    token,
    manual_code: manualCode,
    issued_at: issuedAt,
    expires_at: expiresAt,
    refresh_after_seconds: Math.max(10, Number(credential.refresh_after_seconds || 25)),
    ttl_seconds: Math.max(30, Number(credential.ttl_seconds || 60)),
    generation: Math.max(1, Number(credential.generation || 1)),
  };
}

export async function issueLiveTicketCredential(ticketId: string): Promise<LiveTicketCredential> {
  const id = normalize(ticketId);
  if (!id) throw new Error("Ticket ID is required.");

  const { data, error } = await supabase.rpc("issue_ticket_live_credential", {
    p_ticket_id: id,
  });

  if (error) throw new Error(error.message || "Could not refresh live ticket QR.");
  return normalizeCredential(data);
}
