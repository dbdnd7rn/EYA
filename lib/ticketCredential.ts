import type { IssuedTicket } from "@/lib/tickets";

export const TICKET_QR_VERSION = 1 as const;
export const TICKET_QR_KIND = "eya_ticket" as const;

export type TicketQrCredential = {
  v: typeof TICKET_QR_VERSION;
  kind: typeof TICKET_QR_KIND;
  ticket_code: string;
};

function normalizeTicketCode(value: unknown) {
  return String(value ?? "").trim().toUpperCase();
}

export function buildTicketQrCredential(ticket: Pick<IssuedTicket, "ticket_code">): TicketQrCredential {
  const ticketCode = normalizeTicketCode(ticket.ticket_code);
  if (!ticketCode) throw new Error("Ticket code is unavailable.");

  return {
    v: TICKET_QR_VERSION,
    kind: TICKET_QR_KIND,
    ticket_code: ticketCode,
  };
}

export function buildTicketQrPayload(ticket: Pick<IssuedTicket, "ticket_code">) {
  return JSON.stringify(buildTicketQrCredential(ticket));
}

export function extractTicketCodeFromQrPayload(value: string) {
  const raw = String(value || "").trim();
  if (!raw) return "";

  try {
    const parsed = JSON.parse(raw) as {
      ticket_code?: unknown;
      ticketCode?: unknown;
      code?: unknown;
    };
    const code = parsed.ticket_code ?? parsed.ticketCode ?? parsed.code;
    if (code) return normalizeTicketCode(code);
  } catch {
    // Plain EYA ticket codes remain compatible for manual entry and legacy QR codes.
  }

  const match = raw.match(/[A-Z]{2,5}-[A-Z0-9-]{6,}/i);
  return normalizeTicketCode(match?.[0] ?? raw);
}

export function canPresentTicketQr(ticket: Pick<IssuedTicket, "status" | "checked_in_at">) {
  return String(ticket.status || "").toLowerCase() === "active" && !ticket.checked_in_at;
}
