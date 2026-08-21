import { supabase } from "@/lib/supabase";

export type OrganizerTicketEventStatus =
  | "draft"
  | "pending_review"
  | "changes_requested"
  | "rejected"
  | "published"
  | "paused"
  | "cancelled"
  | "archived";

export type OrganizerTicketEventSummary = {
  id: string;
  title: string;
  category: string;
  date_label: string;
  starts_at: string | null;
  ends_at: string | null;
  venue: string;
  city: string;
  image_url: string;
  hero_image_url: string;
  status: OrganizerTicketEventStatus;
  review_note: string | null;
  submitted_at: string | null;
  reviewed_at: string | null;
  published_at: string | null;
  updated_at: string;
  tickets_sold: number;
  gross_sales_mwk: number;
  capacity_total: number;
  capacity_remaining: number;
};

export type OrganizerEventDraftInput = {
  title: string;
  category: string;
  description?: string | null;
  dateLabel: string;
  startsAt?: string | null;
  endsAt?: string | null;
  venue: string;
  city: string;
  imageUrl: string;
  heroImageUrl: string;
};

export type OrganizerTicketTierInput = {
  eventId: string;
  tierId?: string | null;
  name: string;
  description?: string | null;
  priceMwk: number;
  capacityTotal: number;
  available?: boolean;
  saleStartsAt?: string | null;
  saleEndsAt?: string | null;
  sortOrder?: number;
};

function message(error: unknown, fallback: string) {
  if (error && typeof error === "object" && "message" in error) {
    return String((error as { message?: unknown }).message || fallback);
  }
  return fallback;
}

export async function listMyOrganizerEvents(): Promise<OrganizerTicketEventSummary[]> {
  const { data, error } = await supabase.rpc("get_my_organizer_events");
  if (error) throw new Error(message(error, "Could not load organizer events."));
  if (!Array.isArray(data)) return [];
  return data.map((row: any) => ({
    ...row,
    tickets_sold: Number(row?.tickets_sold ?? 0),
    gross_sales_mwk: Number(row?.gross_sales_mwk ?? 0),
    capacity_total: Number(row?.capacity_total ?? 0),
    capacity_remaining: Number(row?.capacity_remaining ?? 0),
  })) as OrganizerTicketEventSummary[];
}

export async function createMyTicketEventDraft(input: OrganizerEventDraftInput) {
  const { data, error } = await supabase.rpc("create_my_ticket_event_draft", {
    p_title: input.title.trim(),
    p_category: input.category.trim() || "Music",
    p_description: input.description?.trim() || null,
    p_date_label: input.dateLabel.trim(),
    p_starts_at: input.startsAt || null,
    p_ends_at: input.endsAt || null,
    p_venue: input.venue.trim(),
    p_city: input.city.trim(),
    p_image_url: input.imageUrl.trim(),
    p_hero_image_url: input.heroImageUrl.trim(),
  });
  if (error) throw new Error(message(error, "Could not create event draft."));
  return data as { ok: true; event_id: string; status: OrganizerTicketEventStatus };
}

export async function updateMyTicketEventDraft(eventId: string, input: OrganizerEventDraftInput) {
  const { data, error } = await supabase.rpc("update_my_ticket_event_draft", {
    p_event_id: eventId,
    p_title: input.title.trim(),
    p_category: input.category.trim() || "Music",
    p_description: input.description?.trim() || null,
    p_date_label: input.dateLabel.trim(),
    p_starts_at: input.startsAt || null,
    p_ends_at: input.endsAt || null,
    p_venue: input.venue.trim(),
    p_city: input.city.trim(),
    p_image_url: input.imageUrl.trim(),
    p_hero_image_url: input.heroImageUrl.trim(),
  });
  if (error) throw new Error(message(error, "Could not update event draft."));
  return data as { ok: true; event_id: string; status: OrganizerTicketEventStatus };
}

export async function upsertMyTicketTier(input: OrganizerTicketTierInput) {
  const { data, error } = await supabase.rpc("upsert_my_ticket_tier", {
    p_event_id: input.eventId,
    p_tier_id: input.tierId || null,
    p_name: input.name.trim(),
    p_description: input.description?.trim() || "",
    p_price_mwk: input.priceMwk,
    p_capacity_total: input.capacityTotal,
    p_available: input.available !== false,
    p_sale_starts_at: input.saleStartsAt || null,
    p_sale_ends_at: input.saleEndsAt || null,
    p_sort_order: input.sortOrder ?? 100,
  });
  if (error) throw new Error(message(error, "Could not save ticket type."));
  return data as { ok: true; tier_id: string; event_id: string };
}

export async function submitMyTicketEvent(eventId: string) {
  const { data, error } = await supabase.rpc("submit_my_ticket_event", { p_event_id: eventId });
  if (error) throw new Error(message(error, "Could not submit event for review."));
  return data as { ok: true; event_id: string; status: "pending_review" };
}
