import { supabase } from "@/lib/supabase";

export type AdminTicketRevisionTier = {
  id: string;
  source_tier_id: string | null;
  name: string;
  description: string;
  price_mwk: number;
  capacity_total: number;
  capacity_sold?: number;
  capacity_reserved?: number;
  available: boolean;
  sale_starts_at: string | null;
  sale_ends_at: string | null;
  sort_order: number;
};

export type AdminTicketRevisionEventMaterial = {
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
  approved_version_number?: number | null;
};

export type AdminTicketRevisionReview = {
  id: string;
  event_id: string;
  status: "pending_review";
  base_version_number: number;
  submitted_at: string | null;
  review_note: string | null;
  organizer_id: string;
  organizer: { full_name: string | null; email: string | null; phone: string | null } | null;
  revision_event: AdminTicketRevisionEventMaterial;
  live_event: AdminTicketRevisionEventMaterial;
  revision_tiers: AdminTicketRevisionTier[];
  live_tiers: AdminTicketRevisionTier[];
};

function message(error: unknown, fallback: string) {
  if (error && typeof error === "object" && "message" in error) {
    return String((error as { message?: unknown }).message || fallback);
  }
  return fallback;
}

function tier(row: any): AdminTicketRevisionTier {
  return {
    ...row,
    id: String(row?.id ?? ""),
    source_tier_id: row?.source_tier_id ? String(row.source_tier_id) : null,
    price_mwk: Number(row?.price_mwk ?? 0),
    capacity_total: Number(row?.capacity_total ?? 0),
    capacity_sold: row?.capacity_sold == null ? undefined : Number(row.capacity_sold),
    capacity_reserved: row?.capacity_reserved == null ? undefined : Number(row.capacity_reserved),
    sort_order: Number(row?.sort_order ?? 100),
    available: row?.available !== false,
  };
}

export async function listPendingAdminTicketRevisions(): Promise<AdminTicketRevisionReview[]> {
  const { data, error } = await supabase.rpc("admin_list_pending_ticket_event_revisions");
  if (error) throw new Error(message(error, "Could not load live event revisions."));
  if (!Array.isArray(data)) return [];
  return data.map((row: any) => ({
    ...row,
    id: String(row.id),
    event_id: String(row.event_id),
    organizer_id: String(row.organizer_id),
    status: "pending_review" as const,
    base_version_number: Number(row?.base_version_number ?? 0),
    live_event: {
      ...row.live_event,
      approved_version_number: row?.live_event?.approved_version_number == null ? null : Number(row.live_event.approved_version_number),
    },
    revision_event: row.revision_event,
    revision_tiers: (Array.isArray(row.revision_tiers) ? row.revision_tiers : []).map(tier),
    live_tiers: (Array.isArray(row.live_tiers) ? row.live_tiers : []).map(tier),
  })) as AdminTicketRevisionReview[];
}

export async function reviewAdminTicketRevision(input: {
  revisionId: string;
  action: "approve" | "request_changes" | "reject";
  note?: string | null;
}) {
  const { data, error } = await supabase.rpc("admin_review_ticket_event_revision", {
    p_revision_id: input.revisionId,
    p_action: input.action,
    p_note: input.note?.trim() || null,
  });
  if (error) throw new Error(message(error, "Could not review live event revision."));
  return data as {
    ok: true;
    revision_id: string;
    event_id?: string;
    status: string;
    approved_version_number?: number;
    approval_hash?: string;
  };
}
