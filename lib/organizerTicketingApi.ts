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

export type OrganizerTicketRevisionStatus =
  | "draft"
  | "pending_review"
  | "changes_requested"
  | "approved"
  | "rejected"
  | "cancelled";

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
  approved_version_number: number | null;
  open_revision_id: string | null;
  open_revision_status: OrganizerTicketRevisionStatus | null;
  tickets_sold: number;
  gross_sales_mwk: number;
  capacity_total: number;
  capacity_remaining: number;
};

export type OrganizerTicketTierDetail = {
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
  sort_order: number;
};

export type OrganizerTicketEventDetail = {
  id: string;
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
  status: OrganizerTicketEventStatus;
  review_note: string | null;
  submitted_at: string | null;
  reviewed_at: string | null;
  published_at: string | null;
  approved_version_id: string | null;
  approved_version_number: number | null;
  open_revision_id: string | null;
  open_revision_status: OrganizerTicketRevisionStatus | null;
  tiers: OrganizerTicketTierDetail[];
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

export type OrganizerTicketRevisionTier = {
  id: string;
  source_tier_id: string | null;
  name: string;
  description: string;
  price_mwk: number;
  capacity_total: number;
  available: boolean;
  sale_starts_at: string | null;
  sale_ends_at: string | null;
  sort_order: number;
};

export type OrganizerTicketRevisionDetail = {
  id: string;
  event_id: string;
  status: OrganizerTicketRevisionStatus;
  base_version_number: number;
  review_note: string | null;
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
  live_status: OrganizerTicketEventStatus;
  live_version_number: number | null;
  tiers: OrganizerTicketRevisionTier[];
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
    approved_version_number: row?.approved_version_number == null ? null : Number(row.approved_version_number),
    open_revision_id: row?.open_revision_id ? String(row.open_revision_id) : null,
    open_revision_status: row?.open_revision_status ?? null,
    tickets_sold: Number(row?.tickets_sold ?? 0),
    gross_sales_mwk: Number(row?.gross_sales_mwk ?? 0),
    capacity_total: Number(row?.capacity_total ?? 0),
    capacity_remaining: Number(row?.capacity_remaining ?? 0),
  })) as OrganizerTicketEventSummary[];
}

export async function getMyOrganizerEventDetail(eventId: string): Promise<OrganizerTicketEventDetail> {
  const { data, error } = await supabase.rpc("get_my_organizer_event_detail", { p_event_id: eventId });
  if (error) throw new Error(message(error, "Could not load organizer event."));
  if (!data?.id) throw new Error("Organizer event not found.");
  const tiers = Array.isArray(data?.tiers) ? data.tiers : [];
  return {
    ...(data as OrganizerTicketEventDetail),
    approved_version_number: data?.approved_version_number == null ? null : Number(data.approved_version_number),
    open_revision_id: data?.open_revision_id ? String(data.open_revision_id) : null,
    open_revision_status: data?.open_revision_status ?? null,
    tiers: tiers.map((tier: any) => ({
      ...tier,
      price_mwk: Number(tier?.price_mwk ?? 0),
      capacity_total: Number(tier?.capacity_total ?? 0),
      capacity_sold: Number(tier?.capacity_sold ?? 0),
      capacity_reserved: Number(tier?.capacity_reserved ?? 0),
      sort_order: Number(tier?.sort_order ?? 100),
    })),
  };
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

export async function startMyTicketEventRevision(eventId: string) {
  const { data, error } = await supabase.rpc("start_my_ticket_event_revision", { p_event_id: eventId });
  if (error) throw new Error(message(error, "Could not start event revision."));
  return data as { ok: true; revision_id: string; event_id: string; status: "draft"; base_version_number: number };
}

export async function getMyTicketEventRevision(revisionId: string): Promise<OrganizerTicketRevisionDetail> {
  const { data, error } = await supabase.rpc("get_my_ticket_event_revision", { p_revision_id: revisionId });
  if (error) throw new Error(message(error, "Could not load event revision."));
  if (!data?.id) throw new Error("Event revision not found.");
  return {
    ...(data as OrganizerTicketRevisionDetail),
    base_version_number: Number(data.base_version_number ?? 0),
    live_version_number: data.live_version_number == null ? null : Number(data.live_version_number),
    tiers: (Array.isArray(data.tiers) ? data.tiers : []).map((tier: any) => ({
      ...tier,
      price_mwk: Number(tier?.price_mwk ?? 0),
      capacity_total: Number(tier?.capacity_total ?? 0),
      sort_order: Number(tier?.sort_order ?? 100),
    })),
  };
}

export async function updateMyTicketEventRevision(revisionId: string, input: OrganizerEventDraftInput) {
  const { data, error } = await supabase.rpc("update_my_ticket_event_revision", {
    p_revision_id: revisionId,
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
  if (error) throw new Error(message(error, "Could not save event revision."));
  return data as { ok: true; revision_id: string; status: "draft" };
}

export async function upsertMyTicketEventRevisionTier(input: {
  revisionId: string;
  revisionTierId?: string | null;
  name: string;
  description?: string | null;
  priceMwk: number;
  capacityTotal: number;
  available?: boolean;
  saleStartsAt?: string | null;
  saleEndsAt?: string | null;
  sortOrder?: number;
}) {
  const { data, error } = await supabase.rpc("upsert_my_ticket_event_revision_tier", {
    p_revision_id: input.revisionId,
    p_revision_tier_id: input.revisionTierId || null,
    p_name: input.name.trim(),
    p_description: input.description?.trim() || "",
    p_price_mwk: input.priceMwk,
    p_capacity_total: input.capacityTotal,
    p_available: input.available !== false,
    p_sale_starts_at: input.saleStartsAt || null,
    p_sale_ends_at: input.saleEndsAt || null,
    p_sort_order: input.sortOrder ?? 100,
  });
  if (error) throw new Error(message(error, "Could not save revised ticket terms."));
  return data as { ok: true; revision_tier_id: string; revision_id: string };
}

export async function removeMyTicketEventRevisionTier(revisionTierId: string) {
  const { data, error } = await supabase.rpc("remove_my_ticket_event_revision_tier", { p_revision_tier_id: revisionTierId });
  if (error) throw new Error(message(error, "Could not remove revised ticket type."));
  return data as { ok: true; revision_id: string; disabled: boolean };
}

export async function submitMyTicketEventRevision(revisionId: string) {
  const { data, error } = await supabase.rpc("submit_my_ticket_event_revision", { p_revision_id: revisionId });
  if (error) throw new Error(message(error, "Could not submit live event revision."));
  return data as { ok: true; revision_id: string; event_id: string; status: "pending_review" };
}
