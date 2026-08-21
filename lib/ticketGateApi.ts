import { supabase } from "@/lib/supabase";
import type { AdminTicketCheckInResult } from "@/lib/adminControlApi";

export type LiveTicketGateMethod = "qr" | "manual";

const QR_PREFIXES = ["EYA-LIVE-2-", "EYA-GUEST-2-", "EYA-OFFLINE-1-"] as const;
const MANUAL_PREFIXES = ["LIVE-", "GUEST-", "OFF-"] as const;

function normalize(value: unknown) {
  return String(value ?? "").trim().toUpperCase();
}

export function normalizeTicketEntryCredential(value: unknown, method: LiveTicketGateMethod) {
  const raw = normalize(value);
  const prefixes = method === "manual" ? MANUAL_PREFIXES : QR_PREFIXES;
  return prefixes.some((prefix) => raw.startsWith(prefix)) ? raw : "";
}

export function ticketEntryCredentialKind(value: unknown) {
  const raw = normalize(value);
  if (raw.startsWith("EYA-LIVE-2-") || raw.startsWith("LIVE-")) return "Personal live pass";
  if (raw.startsWith("EYA-GUEST-2-") || raw.startsWith("GUEST-")) return "Guest live pass";
  if (raw.startsWith("EYA-OFFLINE-1-") || raw.startsWith("OFF-")) return "Offline guest pass";
  return "Unknown pass";
}

export async function checkInLiveTicketCredential(input: {
  credential: string;
  method: LiveTicketGateMethod;
  eventId?: string | null;
  deviceLabel?: string | null;
}): Promise<AdminTicketCheckInResult & { credential_kind?: string; guest_pass?: { id?: string; guest_name?: string | null; mode?: string } | null }> {
  const credential = normalizeTicketEntryCredential(input.credential, input.method);
  if (!credential) {
    throw new Error(
      input.method === "manual"
        ? "Enter a current LIVE-, GUEST-, or OFF- backup code. Permanent ticket references are not accepted."
        : "This is not an EYA entry QR. Ask the guest to show their live or offline EYA pass.",
    );
  }

  const { data, error } = await supabase.rpc("check_in_ticket_entry_credential", {
    p_credential: credential,
    p_event_id: input.eventId || null,
    p_device_label: input.deviceLabel || null,
    p_method: input.method,
  });

  if (error) throw new Error(error.message || "Ticket check-in failed.");
  if (!data || typeof data !== "object") throw new Error("Ticket check-in returned no result.");
  return data as AdminTicketCheckInResult & { credential_kind?: string; guest_pass?: { id?: string; guest_name?: string | null; mode?: string } | null };
}
