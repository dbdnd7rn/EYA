import type { AdminTicketCheckInResult } from "@/lib/adminControlApi";
import { supabase } from "@/lib/supabase";

export type LiveTicketGateMethod = "qr" | "manual";

type GuestPassResult = {
  id?: string;
  guest_name?: string | null;
  mode?: string | null;
} | null;

export type TicketGateCheckInResult = {
  status: string;
  credential_kind?: string;
  scanner_access_kind?: string;
  scanner_assignment_id?: string | null;
  gate_label?: string | null;
  guest_pass?: GuestPassResult;
  ticket: {
    id: string;
    event_id: string;
    order_id?: string | null;
    tier_id?: string | null;
    user_id?: string | null;
    ticket_code: string;
    status: string;
    checked_in_at: string | null;
    event?: {
      id: string;
      title: string;
      date_label?: string | null;
      venue?: string | null;
      city?: string | null;
    } | null;
    tier?: {
      id: string;
      name: string;
      price_mwk?: number;
    } | null;
    order?: {
      id: string;
      total_mwk: number;
      quantity: number;
      payment_status: string;
      paid_at: string | null;
    } | null;
    user?: {
      id: string;
      full_name: string | null;
      email?: string | null;
      phone?: string | null;
    } | null;
  };
  checkin: {
    id: string;
    issued_ticket_id: string;
    event_id: string;
    checked_in_by: string | null;
    method: string;
    device_label: string | null;
    created_at: string;
    scanner_assignment_id?: string | null;
    gate_label?: string | null;
  };
};

type AdminGateCheckInResult = AdminTicketCheckInResult & {
  credential_kind?: string;
  scanner_access_kind?: string;
  scanner_assignment_id?: string | null;
  gate_label?: string | null;
  guest_pass?: GuestPassResult;
};

type GateCheckInInput = {
  credential: string;
  method: LiveTicketGateMethod;
  eventId: string;
  deviceLabel?: string | null;
};

type AdminCheckInInput = {
  credential: string;
  method: LiveTicketGateMethod;
  eventId?: null | undefined;
  deviceLabel?: string | null;
};

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

export function checkInLiveTicketCredential(input: GateCheckInInput): Promise<TicketGateCheckInResult>;
export function checkInLiveTicketCredential(input: AdminCheckInInput): Promise<AdminGateCheckInResult>;
export async function checkInLiveTicketCredential(
  input: GateCheckInInput | AdminCheckInInput,
): Promise<TicketGateCheckInResult | AdminGateCheckInResult> {
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
  return data as TicketGateCheckInResult | AdminGateCheckInResult;
}
