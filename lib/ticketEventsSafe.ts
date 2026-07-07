import AsyncStorage from "@react-native-async-storage/async-storage";
import { listTicketEvents as loadRemoteTicketEvents, ticketEvents, type TicketEvent } from "@/lib/tickets";

const TICKET_EVENTS_CACHE_KEY = "eya.ticketEvents.v2";
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

function searchEvents(events: TicketEvent[], query = "") {
  const term = query.trim().toLowerCase();
  if (!term) return events;
  return events.filter((event) => `${event.title} ${event.category} ${event.venue} ${event.city}`.toLowerCase().includes(term));
}

async function readCachedEvents() {
  try {
    const raw = await AsyncStorage.getItem(TICKET_EVENTS_CACHE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return isTicketEventList(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function saveCachedEvents(events: TicketEvent[]) {
  try {
    if (events.length) await AsyncStorage.setItem(TICKET_EVENTS_CACHE_KEY, JSON.stringify(events));
  } catch {
    // Ignore cache write errors.
  }
}

export async function listTicketEventsSafe(query = "") {
  const cached = await readCachedEvents();
  const fallback = cached.length ? cached : ticketEvents;

  try {
    const live = await Promise.race([loadRemoteTicketEvents(query), wait(TICKET_EVENTS_WAIT_MS)]);
    if (isTicketEventList(live) && live.length) {
      await saveCachedEvents(live);
      return live;
    }
    return searchEvents(fallback, query);
  } catch {
    return searchEvents(fallback, query);
  }
}
