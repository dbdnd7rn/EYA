import { supabase } from "@/lib/supabase";
import type { TicketEvent, TicketTier } from "@/lib/tickets";

const TICKET_EVENTS_WAIT_MS = 4200;

function wait(ms: number) {
  return new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error("Ticket events took too long to load.")), ms);
  });
}

function normalizeTier(row: any): TicketTier {
  const capacityTotal = Number(row?.capacity_total ?? 0);
  const capacitySold = Number(row?.capacity_sold ?? 0);
  const capacityReserved = Number(row?.capacity_reserved ?? 0);
  const remaining = Math.max(0, capacityTotal - capacitySold - capacityReserved);
  return {
    id: String(row?.id ?? ""),
    eventId: String(row?.event_id ?? "") || undefined,
    name: String(row?.name ?? "Ticket"),
    description: String(row?.description ?? ""),
    priceMwk: Number(row?.price_mwk ?? 0),
    available: row?.available !== false && remaining > 0,
    capacityTotal,
    capacitySold,
    capacityReserved,
    remaining,
  };
}

async function loadPublishedEvents(query = ""): Promise<TicketEvent[]> {
  const term = query.trim();
  let request = supabase
    .from("ticket_events")
    .select("id,title,category,description,date_label,starts_at,ends_at,venue,city,image_url,hero_image_url,status,sort_order,metadata")
    .eq("status", "published")
    .order("sort_order", { ascending: true })
    .order("starts_at", { ascending: true, nullsFirst: false })
    .limit(100);

  if (term) {
    request = request.or(`title.ilike.%${term}%,category.ilike.%${term}%,venue.ilike.%${term}%,city.ilike.%${term}%`);
  }

  const { data: eventRows, error: eventError } = await request;
  if (eventError) throw new Error(eventError.message);
  const rows = (eventRows ?? []) as any[];
  if (!rows.length) return [];

  const eventIds = rows.map((row) => String(row.id ?? "")).filter(Boolean);
  const { data: tierRows, error: tierError } = await supabase
    .from("ticket_tiers")
    .select("id,event_id,name,description,price_mwk,capacity_total,capacity_sold,capacity_reserved,available,sort_order")
    .in("event_id", eventIds)
    .order("sort_order", { ascending: true });
  if (tierError) throw new Error(tierError.message);

  const tiersByEvent = new Map<string, TicketTier[]>();
  for (const row of (tierRows ?? []) as any[]) {
    const eventId = String(row.event_id ?? "");
    if (!eventId) continue;
    const current = tiersByEvent.get(eventId) ?? [];
    current.push(normalizeTier(row));
    tiersByEvent.set(eventId, current);
  }

  return rows.map((row) => ({
    id: String(row.id),
    title: String(row.title ?? "Event"),
    category: String(row.category ?? "Event"),
    description: String(row.description ?? ""),
    dateLabel: String(row.date_label ?? ""),
    startsAt: typeof row.starts_at === "string" ? row.starts_at : null,
    endsAt: typeof row.ends_at === "string" ? row.ends_at : null,
    venue: String(row.venue ?? ""),
    city: String(row.city ?? ""),
    image: String(row.image_url ?? ""),
    heroImage: String(row.hero_image_url ?? row.image_url ?? ""),
    rating: Number(row?.metadata?.rating ?? 4.8),
    status: "published",
    tiers: tiersByEvent.get(String(row.id)) ?? [],
  }));
}

export async function listTicketEventsSafe(query = "") {
  try {
    return await Promise.race([loadPublishedEvents(query), wait(TICKET_EVENTS_WAIT_MS)]);
  } catch {
    // Event discovery is server-authoritative. Never resurrect cached, demo, or
    // legacy-backend listings when the Admin-controlled publishing source fails.
    // Purchased-ticket offline access is handled separately by the wallet cache.
    return [];
  }
}
