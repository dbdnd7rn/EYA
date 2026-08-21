import { listTicketEvents as loadRemoteTicketEvents, type TicketEvent } from "@/lib/tickets";

const TICKET_EVENTS_WAIT_MS = 4200;

function wait(ms: number) {
  return new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error("Ticket events took too long to load.")), ms);
  });
}

function isTicketEventList(value: unknown): value is TicketEvent[] {
  return Array.isArray(value) && value.every((item) => {
    const event = item as Partial<TicketEvent>;
    return Boolean(event && typeof event.id === "string" && typeof event.title === "string" && Array.isArray(event.tiers));
  });
}

export async function listTicketEventsSafe(query = "") {
  try {
    const live = await Promise.race([loadRemoteTicketEvents(query), wait(TICKET_EVENTS_WAIT_MS)]);
    return isTicketEventList(live) ? live : [];
  } catch {
    // Discovery is server-authoritative. Never resurrect stale or demo events when
    // the live publishing source is unavailable. Purchased-ticket offline access
    // is handled separately by the wallet cache.
    return [];
  }
}
