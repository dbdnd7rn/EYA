import { supabase } from "@/lib/supabase";
import type { AdminTicketCheckInResult } from "@/lib/adminControlApi";
import {
  normalizeLiveTicketManualCode,
  normalizeLiveTicketQrToken,
} from "@/lib/ticketCredential";

export type LiveTicketGateMethod = "qr" | "manual";

export async function checkInLiveTicketCredential(input: {
  credential: string;
  method: LiveTicketGateMethod;
  eventId?: string | null;
  deviceLabel?: string | null;
}): Promise<AdminTicketCheckInResult> {
  const credential =
    input.method === "manual"
      ? normalizeLiveTicketManualCode(input.credential)
      : normalizeLiveTicketQrToken(input.credential);

  if (!credential) {
    throw new Error(
      input.method === "manual"
        ? "Enter the rotating LIVE backup code from the customer's ticket."
        : "This is not a live EYA ticket QR. Ask the customer to open the live ticket in EYA.",
    );
  }

  const { data, error } = await supabase.rpc("check_in_ticket_live_credential", {
    p_credential: credential,
    p_event_id: input.eventId || null,
    p_device_label: input.deviceLabel || null,
    p_method: input.method,
  });

  if (error) throw new Error(error.message || "Ticket check-in failed.");
  if (!data || typeof data !== "object") throw new Error("Ticket check-in returned no result.");

  return data as AdminTicketCheckInResult;
}
