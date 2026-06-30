import type { IssuedTicket, TicketEvent, TicketTier } from "@/lib/tickets";

export const EYA_BG = "#f4f2fb";
export const EYA_CARD = "#FFFFFF";
export const EYA_TEXT = "#0e2756";
export const EYA_MUTED = "#6e7892";
export const EYA_ACCENT = "#5e73dd";
export const EYA_BORDER = "#e8edf7";
export const EYA_GREEN = "#1f7a46";
export const EYA_SUCCESS = "#22a46e";

export const FALLBACK_EVENT_IMAGE =
  "https://images.unsplash.com/photo-1542362567-b07e54358753?auto=format&fit=crop&w=1200&q=85";

type EventLike = Partial<TicketEvent> & {
  date_label?: string | null;
  starts_at?: string | null;
  ends_at?: string | null;
  image_url?: string | null;
  hero_image_url?: string | null;
};

export function money(amount: number | null | undefined) {
  return `MK ${Number(amount || 0).toLocaleString("en-US")}`;
}

export function uppercase(value: string | null | undefined) {
  return String(value || "").trim().toUpperCase();
}

export function eventDateLabel(event: EventLike | null | undefined) {
  return String(event?.dateLabel || event?.date_label || "Date TBA");
}

export function formatTime(value: string | null | undefined) {
  if (!value) return "";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  return date.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
}

export function eventTimeLabel(event: EventLike | null | undefined) {
  const start = formatTime(event?.startsAt ?? event?.starts_at);
  const end = formatTime(event?.endsAt ?? event?.ends_at);
  if (start && end) return `${start} - ${end}`;
  return start || "Time TBA";
}

export function eventLocation(event: EventLike | null | undefined) {
  const venue = String(event?.venue || "").trim();
  const city = String(event?.city || "").trim();
  if (venue && city) return `${venue}, ${city}`;
  return venue || city || "Venue TBA";
}

export function eventImageUrl(event: EventLike | null | undefined, hero = false) {
  const heroUrl = String(event?.heroImage || event?.hero_image_url || "").trim();
  const imageUrl = String(event?.image || event?.image_url || "").trim();
  return (hero ? heroUrl || imageUrl : imageUrl || heroUrl) || FALLBACK_EVENT_IMAGE;
}

export function availableTiers(event: Pick<TicketEvent, "tiers"> | null | undefined) {
  return (event?.tiers || []).filter((tier) => tier.available && availableQuantity(tier) > 0);
}

export function firstAvailableTier(event: Pick<TicketEvent, "tiers"> | null | undefined) {
  return availableTiers(event)[0] ?? event?.tiers?.[0] ?? null;
}

export function availableQuantity(tier: TicketTier | null | undefined) {
  if (!tier) return 0;
  if (typeof tier.remaining === "number" && Number.isFinite(tier.remaining)) return Math.max(0, tier.remaining);
  if (typeof tier.capacityTotal === "number") {
    return Math.max(0, tier.capacityTotal - Number(tier.capacitySold || 0) - Number(tier.capacityReserved || 0));
  }
  return tier.available ? 10 : 0;
}

export function tierPriceLabel(tier: TicketTier | null | undefined) {
  if (!tier) return "Sold out";
  return money(tier.priceMwk);
}

export function eventPriceLabel(event: Pick<TicketEvent, "tiers"> | null | undefined) {
  const prices = availableTiers(event).map((tier) => tier.priceMwk);
  if (!prices.length) return "Sold out";
  return `From ${money(Math.min(...prices))}`;
}

export function issuedTicketStatus(ticket: IssuedTicket): "upcoming" | "past" | "cancelled" {
  const status = String(ticket.status || "").toLowerCase();
  if (["cancelled", "canceled", "void", "refunded", "failed"].includes(status)) return "cancelled";
  if (status === "used" || ticket.checked_in_at) return "past";

  const eventEnd = ticket.event?.ends_at || ticket.event?.starts_at;
  if (eventEnd) {
    const endTime = Date.parse(eventEnd);
    if (Number.isFinite(endTime) && endTime < Date.now()) return "past";
  }

  return "upcoming";
}

export function userDisplayName(user: { email?: string | null; user_metadata?: Record<string, unknown> } | null | undefined) {
  const metadata = user?.user_metadata || {};
  const name =
    metadata.full_name ||
    metadata.name ||
    [metadata.first_name, metadata.last_name].filter(Boolean).join(" ");
  return typeof name === "string" && name.trim() ? name.trim() : user?.email || "EYA customer";
}

export function ticketCountLabel(quantity: number | null | undefined) {
  const count = Math.max(1, Number(quantity || 1));
  return `${count} ${count === 1 ? "Ticket" : "Tickets"}`;
}
