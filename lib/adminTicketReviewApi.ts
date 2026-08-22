import { supabase } from "@/lib/supabase";

export type AdminTicketReviewTier = {
  id: string;
  name: string;
  description: string;
  price_mwk: number;
  capacity_total: number;
  capacity_sold: number;
  capacity_reserved: number;
  available: boolean;
  sale_starts_at: string | null;
  sale_ends_at: string | null;
};

export type AdminTicketReviewEvent = {
  id: string;
  organizer_id: string | null;
  title: string;
  category: string;
  description: string | null;
  date_label: string;
  starts_at: string | null;
  ends_at: string | null;
  venue: string;
  city: string;
  image_url: string;
  hero_image_url: string;
  status: "pending_review";
  submitted_at: string | null;
  organizer: {
    full_name: string | null;
    email: string | null;
    phone: string | null;
  } | null;
  tiers: AdminTicketReviewTier[];
};

export type AdminTicketReviewResult = {
  ok: true;
  event_id: string;
  status: string;
  approved_version_id?: string | null;
  approved_version_number?: number | null;
  approval_hash?: string | null;
};

function err(error: unknown, fallback: string) {
  if (error && typeof error === "object" && "message" in error) {
    return String((error as { message?: unknown }).message || fallback);
  }
  return fallback;
}

export async function listPendingAdminTicketEvents(): Promise<AdminTicketReviewEvent[]> {
  const { data: events, error: eventError } = await supabase
    .from("ticket_events")
    .select("id,organizer_id,title,category,description,date_label,starts_at,ends_at,venue,city,image_url,hero_image_url,status,submitted_at")
    .eq("status", "pending_review")
    .order("submitted_at", { ascending: true, nullsFirst: false });
  if (eventError) throw new Error(err(eventError, "Could not load pending ticket events."));

  const rows = (events ?? []) as any[];
  if (!rows.length) return [];
  const eventIds = rows.map((row) => String(row.id));
  const organizerIds = [...new Set(rows.map((row) => String(row.organizer_id || "")).filter(Boolean))];

  const [{ data: tiers, error: tierError }, { data: organizers, error: organizerError }] = await Promise.all([
    supabase
      .from("ticket_tiers")
      .select("id,event_id,name,description,price_mwk,capacity_total,capacity_sold,capacity_reserved,available,sale_starts_at,sale_ends_at,sort_order")
      .in("event_id", eventIds)
      .order("sort_order", { ascending: true }),
    organizerIds.length
      ? supabase.from("profiles").select("id,full_name,email,phone").in("id", organizerIds)
      : Promise.resolve({ data: [], error: null } as any),
  ]);
  if (tierError) throw new Error(err(tierError, "Could not load ticket types."));
  if (organizerError) throw new Error(err(organizerError, "Could not load organizers."));

  const tiersByEvent = new Map<string, AdminTicketReviewTier[]>();
  for (const row of (tiers ?? []) as any[]) {
    const eventId = String(row.event_id || "");
    const current = tiersByEvent.get(eventId) ?? [];
    current.push({
      id: String(row.id),
      name: String(row.name || "Ticket"),
      description: String(row.description || ""),
      price_mwk: Number(row.price_mwk || 0),
      capacity_total: Number(row.capacity_total || 0),
      capacity_sold: Number(row.capacity_sold || 0),
      capacity_reserved: Number(row.capacity_reserved || 0),
      available: row.available !== false,
      sale_starts_at: row.sale_starts_at ? String(row.sale_starts_at) : null,
      sale_ends_at: row.sale_ends_at ? String(row.sale_ends_at) : null,
    });
    tiersByEvent.set(eventId, current);
  }

  const organizerById = new Map((organizers ?? []).map((row: any) => [String(row.id), row]));
  return rows.map((row) => {
    const organizer = organizerById.get(String(row.organizer_id || ""));
    return {
      ...row,
      id: String(row.id),
      organizer_id: row.organizer_id ? String(row.organizer_id) : null,
      status: "pending_review" as const,
      organizer: organizer
        ? { full_name: organizer.full_name ?? null, email: organizer.email ?? null, phone: organizer.phone ?? null }
        : null,
      tiers: tiersByEvent.get(String(row.id)) ?? [],
    };
  });
}

export async function reviewAdminTicketEvent(input: {
  eventId: string;
  action: "approve" | "request_changes" | "reject";
  note?: string | null;
}): Promise<AdminTicketReviewResult> {
  const { data, error } = await supabase.rpc("admin_review_ticket_event", {
    p_event_id: input.eventId,
    p_action: input.action,
    p_note: input.note?.trim() || null,
  });
  if (error) throw new Error(err(error, "Could not review event."));
  return data as AdminTicketReviewResult;
}
