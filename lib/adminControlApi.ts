import { ENV } from "@/lib/env";
import { supabase } from "@/lib/supabase";
import type { TicketEvent, TicketTier } from "@/lib/tickets";

export type AdminOrderStatus = "pending" | "accepted" | "preparing" | "picked_up" | "on_the_way" | "delivered" | "cancelled";
export type AdminDeliveryStatus = "searching" | "assigned" | "picked_up" | "arriving" | "delivered" | "failed" | "cancelled";

export type AdminOrderSummary = {
  id: string;
  customer_id: string;
  vendor_id: string;
  channel: "market" | "food";
  status: AdminOrderStatus;
  delivery_mode: "pickup" | "doorstep";
  dropoff_notes: string | null;
  total_mwk: number;
  payment_status: string;
  created_at: string;
  updated_at: string;
  vendor: {
    id: string;
    name: string;
    owner_id: string | null;
  } | null;
  delivery: {
    order_id: string;
    driver_id: string | null;
    status: AdminDeliveryStatus;
    eta_minutes: number | null;
    updated_at: string;
  } | null;
  handoff: {
    order_id: string;
    order_reference: string;
    verified_at: string | null;
  } | null;
};

export type AdminPaymentSummary = {
  id: string;
  user_id: string;
  related_order_id: string | null;
  provider: string | null;
  method: string | null;
  reference: string;
  status: string;
  amount_mwk: number;
  currency: string;
  title: string | null;
  description: string | null;
  customer_email: string | null;
  created_at: string;
  paid_at: string | null;
  verified_at: string | null;
};

export type AdminSupportTicket = {
  id: string;
  user_id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  type: string | null;
  listing_id: string | null;
  subject: string | null;
  message: string | null;
  status: string;
  admin_note: string | null;
  resolved_at: string | null;
  created_at: string;
};

export type AdminTicketCheckInResult = {
  status: string;
  ticket: {
    id: string;
    event_id: string;
    order_id: string;
    tier_id: string;
    user_id: string;
    ticket_code: string;
    status: string;
    checked_in_at: string | null;
    event?: {
      id: string;
      title: string;
      date_label: string;
      venue: string;
      city: string;
    } | null;
    tier?: {
      id: string;
      name: string;
      price_mwk: number;
    } | null;
    order?: {
      id: string;
      total_mwk: number;
      quantity: number;
      payment_status: string;
      paid_at: string | null;
    } | null;
    user?: {
      id: string;
      full_name: string | null;
      email: string | null;
      phone: string | null;
    } | null;
  };
  checkin: {
    id: string;
    issued_ticket_id: string;
    event_id: string;
    checked_in_by: string | null;
    method: string;
    device_label: string | null;
    created_at: string;
  };
};

export type AdminTicketEvent = TicketEvent & {
  description?: string;
  startsAt?: string | null;
  endsAt?: string | null;
  sortOrder?: number;
  tiers: TicketTier[];
};

export type AdminTicketOrderSummary = {
  id: string;
  user_id: string;
  event_id: string;
  tier_id: string;
  quantity: number;
  total_mwk: number;
  status: string;
  payment_status: string;
  payment_reference: string | null;
  reserved_until: string;
  paid_at: string | null;
  created_at: string;
  updated_at: string;
  event?: {
    id: string;
    title: string;
    venue: string;
    city: string;
    date_label: string;
  } | null;
  tier?: {
    id: string;
    name: string;
    price_mwk: number;
  } | null;
  user?: {
    id: string;
    full_name: string | null;
    email: string | null;
    phone: string | null;
  } | null;
};

export type AdminVendorSummary = {
  id: string;
  owner_id: string;
  name: string;
  description: string | null;
  supports_market: boolean;
  supports_food: boolean;
  campus: string | null;
  area: string | null;
  city: string | null;
  latitude: number | null;
  longitude: number | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type AdminCatalogItemSummary = {
  id: string;
  vendor_id: string;
  channel: "market" | "food";
  name: string;
  description: string | null;
  price_mwk: number;
  stock_qty: number | null;
  image_url: string | null;
  image_urls: string[] | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type AdminHousingListingSummary = {
  id: string;
  landlord_id: string;
  title: string;
  listing_type: "hostel" | "bedsitter";
  campus: string | null;
  area: string | null;
  city: string | null;
  price_from: number | null;
  description: string | null;
  contact_phone: string | null;
  is_active: boolean;
  image_urls: string[] | null;
  created_at: string | null;
  updated_at: string | null;
  landlord: {
    id: string;
    full_name: string | null;
    email: string | null;
    phone: string | null;
  } | null;
};

export type AdminUserSummary = {
  id: string;
  full_name: string | null;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  role: "student" | "landlord" | "agent" | "vendor" | "admin";
  onboarded: boolean;
  campus: string | null;
  area: string | null;
  created_at: string | null;
  updated_at: string | null;
  listing_count: number;
  vendor_count: number;
  order_count: number;
};

export type AdminBroadcastAudience = AdminUserSummary["role"] | "all";

type AdminBroadcastResponse = {
  status: string;
  sent_to: number;
  audience_role: AdminBroadcastAudience;
  push_sent?: number;
  recipient_source?: string;
};

export type AdminStaffInviteInput = {
  email: string;
  fullName?: string | null;
  role: AdminUserSummary["role"];
};

export type CreateAdminVendorInput = {
  owner_id: string;
  name: string;
  description?: string | null;
  supports_market?: boolean;
  supports_food?: boolean;
  campus?: string | null;
  area?: string | null;
  city?: string | null;
  is_active?: boolean;
};

export type CreateAdminCatalogItemInput = {
  vendor_id: string;
  channel: "market" | "food";
  name: string;
  description?: string | null;
  price_mwk: number;
  stock_qty?: number | null;
  image_url?: string | null;
  image_urls?: string[] | null;
  is_active?: boolean;
};

export type CreateAdminHousingListingInput = {
  landlord_id: string;
  title: string;
  listing_type: "hostel" | "bedsitter";
  campus?: string | null;
  area?: string | null;
  city?: string | null;
  price_from?: number | null;
  description?: string | null;
  contact_phone: string;
  is_active?: boolean;
};

function backendUrl(path: string) {
  if (!ENV.PAYCHANGU_BACKEND) {
    throw new Error("PayChangu backend URL is not configured.");
  }
  return `${ENV.PAYCHANGU_BACKEND.replace(/\/+$/, "")}${path}`;
}

function adminHeaders(input: { userId: string; accessToken?: string | null; json?: boolean }) {
  return {
    ...(input.json ? { "Content-Type": "application/json" } : {}),
    ...(input.accessToken ? { Authorization: `Bearer ${input.accessToken}` } : {}),
    "x-admin-user-id": input.userId,
  };
}

async function parseJson<T>(res: Response) {
  const payload = (await res.json().catch(() => ({}))) as T & { message?: string };
  if (!res.ok) {
    throw new Error(payload?.message || `Request failed (${res.status}).`);
  }
  return payload;
}

function isMissingEndpointError(error: unknown) {
  return error instanceof Error && /\(404\)|not found/i.test(error.message);
}

function readErrorText(error: unknown) {
  if (!error) return "";
  if (typeof error === "string") return error;
  if (error instanceof Error) return error.message;
  if (typeof error === "object") {
    const value = error as { code?: unknown; message?: unknown; details?: unknown; hint?: unknown };
    return [value.code, value.message, value.details, value.hint]
      .filter((part) => typeof part === "string" && part.trim().length > 0)
      .join(" ");
  }
  return String(error);
}

function isTicketingSchemaUnavailableError(error: unknown) {
  const text = readErrorText(error).toLowerCase();
  return (
    text.includes("ticket_events") ||
    text.includes("ticket_tiers") ||
    text.includes("ticket_orders") ||
    text.includes("issued_tickets") ||
    text.includes("ticket_checkins")
  ) && (
    text.includes("schema cache") ||
    text.includes("could not find") ||
    text.includes("does not exist") ||
    text.includes("relation") ||
    text.includes("not found")
  );
}

function throwAdminTicketingError(error: unknown, action: "load" | "save" | "price" | "check-in"): never {
  if (isTicketingSchemaUnavailableError(error)) {
    throw new Error("Ticketing database tables are missing in the connected Supabase project. Open the Supabase SQL Editor, run supabase/sql/20260602_ticketing.sql, then try again.");
  }

  const text = readErrorText(error);
  if (/row-level security|permission denied|admin access|required|not allowed/i.test(text)) {
    throw new Error("Admin ticketing access is blocked. Confirm this account is an admin and the ticketing RLS policies are applied.");
  }

  throw new Error(text || `Could not ${action} ticket admin data.`);
}

function normalizeAdminTicketTier(row: any): TicketTier {
  const capacityTotal = Number(row?.capacity_total ?? 0);
  const capacitySold = Number(row?.capacity_sold ?? 0);
  const capacityReserved = Number(row?.capacity_reserved ?? 0);
  return {
    id: String(row?.id ?? ""),
    eventId: row?.event_id ? String(row.event_id) : undefined,
    name: String(row?.name ?? ""),
    description: String(row?.description ?? ""),
    priceMwk: Number(row?.price_mwk ?? 0),
    available: Boolean(row?.available) && capacityTotal > capacitySold,
    capacityTotal,
    capacitySold,
    capacityReserved,
    remaining: Math.max(0, capacityTotal - capacitySold - capacityReserved),
  };
}

function normalizeAdminTicketEvent(row: any, tiers: TicketTier[] = []): AdminTicketEvent {
  return {
    id: String(row?.id ?? ""),
    title: String(row?.title ?? ""),
    category: String(row?.category ?? "Music"),
    description: String(row?.description ?? ""),
    dateLabel: String(row?.date_label ?? ""),
    startsAt: row?.starts_at ?? null,
    endsAt: row?.ends_at ?? null,
    venue: String(row?.venue ?? ""),
    city: String(row?.city ?? ""),
    image: String(row?.image_url ?? ""),
    heroImage: String(row?.hero_image_url ?? row?.image_url ?? ""),
    rating: Number(row?.metadata?.rating ?? 4.8),
    status: String(row?.status ?? "draft"),
    sortOrder: Number(row?.sort_order ?? 100),
    tiers,
  };
}

async function getAdminTicketTiersByEventIds(eventIds: string[]) {
  if (!eventIds.length) return new Map<string, TicketTier[]>();

  const { data, error } = await supabase
    .from("ticket_tiers")
    .select("id,event_id,name,description,price_mwk,capacity_total,capacity_sold,capacity_reserved,available,sort_order")
    .in("event_id", eventIds)
    .order("sort_order", { ascending: true });
  if (error) {
    if (isTicketingSchemaUnavailableError(error)) return new Map<string, TicketTier[]>();
    throwAdminTicketingError(error, "load");
  }

  const byEvent = new Map<string, TicketTier[]>();
  ((data ?? []) as any[]).forEach((row) => {
    const eventId = String(row.event_id ?? "");
    if (!eventId) return;
    const current = byEvent.get(eventId) ?? [];
    current.push(normalizeAdminTicketTier(row));
    byEvent.set(eventId, current);
  });
  return byEvent;
}

async function listAdminTicketEventsViaSupabase(input: { query?: string | null; limit?: number }) {
  const normalizedLimit = Math.min(Math.max(Number(input.limit || 200), 1), 500);
  const term = input.query?.trim() ?? "";
  let request = supabase
    .from("ticket_events")
    .select("id,title,category,description,date_label,starts_at,ends_at,venue,city,image_url,hero_image_url,status,sort_order,metadata,created_at,updated_at")
    .order("created_at", { ascending: false })
    .limit(normalizedLimit);

  if (term) {
    request = request.or(`title.ilike.%${term}%,category.ilike.%${term}%,venue.ilike.%${term}%,city.ilike.%${term}%`);
  }

  const { data, error } = await request;
  if (error) {
    if (isTicketingSchemaUnavailableError(error)) return [];
    throwAdminTicketingError(error, "load");
  }

  const rows = (data ?? []) as any[];
  const tierMap = await getAdminTicketTiersByEventIds(rows.map((row) => String(row.id)).filter(Boolean));
  return rows.map((row) => normalizeAdminTicketEvent(row, tierMap.get(String(row.id)) ?? []));
}

async function upsertAdminTicketEventViaSupabase(input: {
  id?: string | null;
  title: string;
  category: string;
  description?: string | null;
  dateLabel: string;
  startsAt?: string | null;
  endsAt?: string | null;
  venue: string;
  city: string;
  image: string;
  heroImage: string;
  status: "draft" | "published" | "cancelled" | "archived";
  sortOrder?: number;
  userId: string;
}) {
  const payload = {
    ...(input.id ? { id: input.id } : {}),
    title: input.title.trim(),
    category: input.category.trim() || "Music",
    description: input.description?.trim() || null,
    date_label: input.dateLabel.trim(),
    starts_at: input.startsAt || null,
    ends_at: input.endsAt || null,
    venue: input.venue.trim(),
    city: input.city.trim(),
    image_url: input.image.trim(),
    hero_image_url: input.heroImage.trim() || input.image.trim(),
    status: input.status,
    created_by: input.userId,
    sort_order: input.sortOrder ?? 100,
  };

  const { data, error } = await supabase.from("ticket_events").upsert(payload).select("*").single();
  if (error) throwAdminTicketingError(error, "save");
  return { status: "success", event: data as { id: string } & Record<string, unknown> };
}

async function upsertAdminTicketTierViaSupabase(input: {
  id?: string | null;
  eventId: string;
  name: string;
  description?: string | null;
  priceMwk: number;
  capacityTotal: number;
  available: boolean;
  sortOrder?: number;
}) {
  const payload = {
    ...(input.id ? { id: input.id } : {}),
    event_id: input.eventId,
    name: input.name.trim(),
    description: input.description?.trim() || "",
    price_mwk: input.priceMwk,
    capacity_total: Math.max(0, Math.floor(Number(input.capacityTotal || 0))),
    available: input.available,
    sort_order: input.sortOrder ?? 100,
  };

  const { data, error } = await supabase.from("ticket_tiers").upsert(payload).select("*").single();
  if (error) throwAdminTicketingError(error, "price");
  return { status: "success", tier: data as { id: string } & Record<string, unknown> };
}

async function listAdminTicketOrdersViaSupabase(input: { status?: string | null; limit?: number }) {
  let request = supabase
    .from("ticket_orders")
    .select("id,user_id,event_id,tier_id,quantity,total_mwk,status,payment_status,payment_reference,reserved_until,paid_at,created_at,updated_at")
    .order("created_at", { ascending: false })
    .limit(Math.min(Math.max(Number(input.limit || 200), 1), 500));
  if (input.status) request = request.eq("status", input.status);

  const { data, error } = await request;
  if (error) {
    if (isTicketingSchemaUnavailableError(error)) return [] satisfies AdminTicketOrderSummary[];
    throwAdminTicketingError(error, "load");
  }

  const rows = (data ?? []) as any[];
  if (!rows.length) return [] satisfies AdminTicketOrderSummary[];

  const eventIds = [...new Set(rows.map((row) => String(row.event_id || "")).filter(Boolean))];
  const tierIds = [...new Set(rows.map((row) => String(row.tier_id || "")).filter(Boolean))];
  const userIds = [...new Set(rows.map((row) => String(row.user_id || "")).filter(Boolean))];

  const [eventsRes, tiersRes, usersRes] = await Promise.all([
    eventIds.length ? supabase.from("ticket_events").select("id,title,venue,city,date_label").in("id", eventIds) : Promise.resolve({ data: [], error: null }),
    tierIds.length ? supabase.from("ticket_tiers").select("id,name,price_mwk").in("id", tierIds) : Promise.resolve({ data: [], error: null }),
    userIds.length ? supabase.from("profiles").select("id,full_name,email,phone").in("id", userIds) : Promise.resolve({ data: [], error: null }),
  ]);
  if (eventsRes.error && !isTicketingSchemaUnavailableError(eventsRes.error)) throwAdminTicketingError(eventsRes.error, "load");
  if (tiersRes.error && !isTicketingSchemaUnavailableError(tiersRes.error)) throwAdminTicketingError(tiersRes.error, "load");

  const eventById = new Map(((eventsRes.data ?? []) as any[]).map((row) => [String(row.id), row]));
  const tierById = new Map(((tiersRes.data ?? []) as any[]).map((row) => [String(row.id), row]));
  const userById = new Map((usersRes.error ? [] : ((usersRes.data ?? []) as any[])).map((row) => [String(row.id), row]));

  return rows.map((row) => ({
    id: String(row.id),
    user_id: String(row.user_id),
    event_id: String(row.event_id),
    tier_id: String(row.tier_id),
    quantity: Number(row.quantity ?? 0),
    total_mwk: Number(row.total_mwk ?? 0),
    status: String(row.status ?? ""),
    payment_status: String(row.payment_status ?? ""),
    payment_reference: row.payment_reference ?? null,
    reserved_until: String(row.reserved_until ?? ""),
    paid_at: row.paid_at ?? null,
    created_at: String(row.created_at ?? ""),
    updated_at: String(row.updated_at ?? ""),
    event: eventById.get(String(row.event_id)) ?? null,
    tier: tierById.get(String(row.tier_id)) ?? null,
    user: userById.get(String(row.user_id)) ?? null,
  })) satisfies AdminTicketOrderSummary[];
}

async function checkInAdminTicketViaSupabase(input: {
  ticketCode: string;
  eventId?: string | null;
  deviceLabel?: string | null;
  userId: string;
}) {
  const code = input.ticketCode.trim().toUpperCase();
  if (!code) throw new Error("Ticket code is required.");

  const { data: ticket, error: ticketError } = await supabase
    .from("issued_tickets")
    .select("id,event_id,order_id,tier_id,user_id,ticket_code,status,checked_in_at")
    .eq("ticket_code", code)
    .maybeSingle();
  if (ticketError) throwAdminTicketingError(ticketError, "check-in");
  if (!ticket) throw new Error("Ticket not found.");
  if (input.eventId && ticket.event_id !== input.eventId) throw new Error("Ticket is for another event.");
  if (ticket.status !== "active") throw new Error(`Ticket is ${ticket.status}.`);
  if (ticket.checked_in_at) throw new Error("Ticket has already been checked in.");

  const now = new Date().toISOString();
  const { data: updatedRows, error: updateError } = await supabase
    .from("issued_tickets")
    .update({
      status: "used",
      checked_in_at: now,
      checked_in_by: input.userId,
      updated_at: now,
    })
    .eq("id", ticket.id)
    .eq("status", "active")
    .is("checked_in_at", null)
    .select("id,event_id,order_id,tier_id,user_id,ticket_code,status,checked_in_at");
  if (updateError) throwAdminTicketingError(updateError, "check-in");

  const updated = Array.isArray(updatedRows) ? updatedRows[0] : null;
  if (!updated) throw new Error("Ticket has already been checked in.");

  const { data: checkin, error: checkinError } = await supabase
    .from("ticket_checkins")
    .insert({
      issued_ticket_id: ticket.id,
      event_id: ticket.event_id,
      checked_in_by: input.userId,
      method: "qr",
      device_label: input.deviceLabel || null,
    })
    .select("*")
    .single();
  if (checkinError) throwAdminTicketingError(checkinError, "check-in");

  const [eventRes, tierRes, orderRes, userRes] = await Promise.all([
    supabase.from("ticket_events").select("id,title,date_label,venue,city").eq("id", updated.event_id).maybeSingle(),
    supabase.from("ticket_tiers").select("id,name,price_mwk").eq("id", updated.tier_id).maybeSingle(),
    supabase.from("ticket_orders").select("id,total_mwk,quantity,payment_status,paid_at").eq("id", updated.order_id).maybeSingle(),
    supabase.from("profiles").select("id,full_name,email,phone").eq("id", updated.user_id).maybeSingle(),
  ]);
  if (eventRes.error) throwAdminTicketingError(eventRes.error, "check-in");
  if (tierRes.error) throwAdminTicketingError(tierRes.error, "check-in");
  if (orderRes.error) throwAdminTicketingError(orderRes.error, "check-in");
  if (userRes.error) throwAdminTicketingError(userRes.error, "check-in");

  return {
    status: "success",
    ticket: {
      ...updated,
      event: eventRes.data ?? null,
      tier: tierRes.data ?? null,
      order: orderRes.data ?? null,
      user: userRes.data ?? null,
    },
    checkin,
  } satisfies AdminTicketCheckInResult;
}

async function listBroadcastRecipientIds(audienceRole: AdminBroadcastAudience) {
  const pageSize = 1000;
  const ids = new Set<string>();

  for (let from = 0; ; from += pageSize) {
    let query = supabase.from("profiles").select("id").range(from, from + pageSize - 1);
    if (audienceRole !== "all") query = query.eq("role", audienceRole);

    const { data, error } = await query;
    if (error) throw error;

    (data ?? []).forEach((row) => {
      const id = (row as { id?: string | null }).id;
      if (id) ids.add(id);
    });

    if (!data || data.length < pageSize) break;
  }

  return [...ids];
}

async function broadcastViaSupabaseRpc(input: {
  title: string;
  message: string;
  audienceRole: AdminBroadcastAudience;
  priority?: "normal" | "important";
  type?: string;
}) {
  const { data, error } = await supabase.rpc("admin_broadcast_notification", {
    p_title: input.title,
    p_message: input.message,
    p_audience_role: input.audienceRole,
    p_priority: input.priority ?? "normal",
    p_type: input.type ?? "admin_notice",
  });

  if (error) throw error;

  const payload = (data ?? {}) as Partial<AdminBroadcastResponse>;
  return {
    status: payload.status ?? "success",
    sent_to: Number(payload.sent_to ?? 0),
    audience_role: payload.audience_role ?? input.audienceRole,
    recipient_source: payload.recipient_source,
  };
}

async function broadcastViaClientInsert(input: {
  title: string;
  message: string;
  audienceRole: AdminBroadcastAudience;
  priority?: "normal" | "important";
  type?: string;
}) {
  const userIds = await listBroadcastRecipientIds(input.audienceRole);
  const rows = userIds.map((userId) => ({
    user_id: userId,
    title: input.title,
    message: input.message,
    type: input.type ?? "admin_notice",
    priority: input.priority ?? "normal",
    data: {
      audienceRole: input.audienceRole,
      broadcast: true,
    },
    is_read: false,
  }));

  if (rows.length) {
    const { error } = await supabase.from("notifications").insert(rows);
    if (error) throw error;
  }

  return {
    status: "success",
    sent_to: userIds.length,
    audience_role: input.audienceRole,
    recipient_source: "profiles",
  };
}

async function broadcastViaSupabase(input: {
  title: string;
  message: string;
  audienceRole: AdminBroadcastAudience;
  priority?: "normal" | "important";
  type?: string;
}) {
  try {
    return await broadcastViaSupabaseRpc(input);
  } catch {
    return broadcastViaClientInsert(input);
  }
}

type SupabaseAdminProfileRow = Partial<Omit<AdminUserSummary, "role" | "listing_count" | "vendor_count" | "order_count">> & {
  role?: string | null;
  surname?: string | null;
};

const ADMIN_PROFILE_SELECTS = [
  "id,full_name,first_name,last_name,email,phone,role,onboarded,campus,area,created_at,updated_at",
  "id,full_name,first_name,surname,email,phone,role,onboarded,campus,area,created_at,updated_at",
  "id,full_name,email,phone,role,onboarded,campus,area,created_at,updated_at",
];

function normalizeAdminUserRole(role: string | null | undefined): AdminUserSummary["role"] {
  return role === "landlord" || role === "agent" || role === "vendor" || role === "admin" ? role : "student";
}

function profileMatchesAdminQuery(row: SupabaseAdminProfileRow, queryText: string) {
  if (!queryText) return true;
  const normalized = queryText.toLowerCase();
  return [
    row.full_name,
    row.first_name,
    row.last_name,
    row.surname,
    row.email,
    row.phone,
    row.role,
    row.campus,
    row.area,
  ].some((value) => String(value ?? "").toLowerCase().includes(normalized));
}

async function listAdminUsersViaSupabase(input: {
  query?: string | null;
  role?: AdminUserSummary["role"] | null;
  limit?: number;
}): Promise<AdminUserSummary[]> {
  let lastError: unknown = null;

  for (const selectClause of ADMIN_PROFILE_SELECTS) {
    try {
      let query = supabase
        .from("profiles")
        .select(selectClause)
        .order("created_at", { ascending: false })
        .limit(Math.min(Math.max(Number(input.limit || 240), 1), 400));

      if (input.role) query = query.eq("role", input.role);

      const { data, error } = await query;
      if (error) throw error;

      const queryText = input.query?.trim().toLowerCase() ?? "";
      return ((data ?? []) as SupabaseAdminProfileRow[])
        .filter((row) => row.id && profileMatchesAdminQuery(row, queryText))
        .map((row) => ({
          id: String(row.id),
          full_name: row.full_name ?? null,
          first_name: row.first_name ?? null,
          last_name: row.last_name ?? row.surname ?? null,
          email: row.email ?? null,
          phone: row.phone ?? null,
          role: normalizeAdminUserRole(row.role),
          onboarded: Boolean(row.onboarded),
          campus: row.campus ?? null,
          area: row.area ?? null,
          created_at: row.created_at ?? null,
          updated_at: row.updated_at ?? null,
          listing_count: 0,
          vendor_count: 0,
          order_count: 0,
        })) satisfies AdminUserSummary[];
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Could not load users from profiles.");
}

export async function listAdminOrders(input: {
  userId: string;
  accessToken?: string | null;
  status?: string | null;
  deliveryStatus?: string | null;
  limit?: number;
}) {
  if (ENV.DEV_AUTH_MODE) return [];

  const query = new URLSearchParams();
  if (input.limit) query.set("limit", String(input.limit));
  if (input.status) query.set("status", input.status);
  if (input.deliveryStatus) query.set("delivery_status", input.deliveryStatus);

  const res = await fetch(backendUrl(`/api/admin/orders${query.size ? `?${query.toString()}` : ""}`), {
    method: "GET",
    headers: adminHeaders({ userId: input.userId, accessToken: input.accessToken }),
  });
  const data = await parseJson<{ status: string; orders: AdminOrderSummary[] }>(res);
  return data.orders ?? [];
}

export async function listAdminPayments(input: {
  userId: string;
  accessToken?: string | null;
  status?: string | null;
  limit?: number;
}) {
  if (ENV.DEV_AUTH_MODE) return [];

  const query = new URLSearchParams();
  if (input.limit) query.set("limit", String(input.limit));
  if (input.status) query.set("status", input.status);

  const res = await fetch(backendUrl(`/api/admin/payments${query.size ? `?${query.toString()}` : ""}`), {
    method: "GET",
    headers: adminHeaders({ userId: input.userId, accessToken: input.accessToken }),
  });
  const data = await parseJson<{ status: string; payments: AdminPaymentSummary[] }>(res);
  return data.payments ?? [];
}

export async function updateAdminOrderStatus(input: {
  orderId: string;
  status: AdminOrderStatus;
  userId: string;
  accessToken?: string | null;
}) {
  const res = await fetch(backendUrl(`/api/admin/orders/${encodeURIComponent(input.orderId)}/status`), {
    method: "POST",
    headers: adminHeaders({ userId: input.userId, accessToken: input.accessToken, json: true }),
    body: JSON.stringify({ status: input.status }),
  });
  return parseJson<{ status: string; order: Record<string, unknown> }>(res);
}

export async function assignAdminDriver(input: {
  orderId: string;
  driverId: string;
  etaMinutes?: number | null;
  userId: string;
  accessToken?: string | null;
}) {
  const res = await fetch(backendUrl(`/api/admin/orders/${encodeURIComponent(input.orderId)}/assign-driver`), {
    method: "POST",
    headers: adminHeaders({ userId: input.userId, accessToken: input.accessToken, json: true }),
    body: JSON.stringify({
      driver_id: input.driverId,
      eta_minutes: input.etaMinutes ?? null,
    }),
  });
  return parseJson<{ status: string; delivery: Record<string, unknown> }>(res);
}

export async function listAdminSupportTickets(input: {
  userId: string;
  accessToken?: string | null;
  status?: string | null;
  limit?: number;
}) {
  if (ENV.DEV_AUTH_MODE) return [];

  const query = new URLSearchParams();
  if (input.limit) query.set("limit", String(input.limit));
  if (input.status) query.set("status", input.status);

  const res = await fetch(backendUrl(`/api/admin/support-tickets${query.size ? `?${query.toString()}` : ""}`), {
    method: "GET",
    headers: adminHeaders({ userId: input.userId, accessToken: input.accessToken }),
  });
  const data = await parseJson<{ status: string; tickets: AdminSupportTicket[] }>(res);
  return data.tickets ?? [];
}

export async function respondAdminSupportTicket(input: {
  ticketId: string;
  status: "new" | "open" | "resolved" | "closed";
  adminNote?: string | null;
  userId: string;
  accessToken?: string | null;
}) {
  const res = await fetch(backendUrl(`/api/admin/support-tickets/${encodeURIComponent(input.ticketId)}/respond`), {
    method: "POST",
    headers: adminHeaders({ userId: input.userId, accessToken: input.accessToken, json: true }),
    body: JSON.stringify({
      status: input.status,
      admin_note: input.adminNote ?? null,
    }),
  });
  return parseJson<{ status: string; ticket: AdminSupportTicket }>(res);
}

export async function checkInAdminTicket(input: {
  ticketCode: string;
  eventId?: string | null;
  deviceLabel?: string | null;
  userId: string;
  accessToken?: string | null;
}) {
  return checkInAdminTicketViaSupabase(input);
}

export async function listAdminTicketEvents(input: {
  userId: string;
  accessToken?: string | null;
  query?: string | null;
  limit?: number;
}) {
  return listAdminTicketEventsViaSupabase(input);
}

export async function upsertAdminTicketEvent(input: {
  id?: string | null;
  title: string;
  category: string;
  description?: string | null;
  dateLabel: string;
  startsAt?: string | null;
  endsAt?: string | null;
  venue: string;
  city: string;
  image: string;
  heroImage: string;
  status: "draft" | "published" | "cancelled" | "archived";
  sortOrder?: number;
  userId: string;
  accessToken?: string | null;
}) {
  return upsertAdminTicketEventViaSupabase(input);
}

export async function upsertAdminTicketTier(input: {
  id?: string | null;
  eventId: string;
  name: string;
  description?: string | null;
  priceMwk: number;
  capacityTotal: number;
  available: boolean;
  sortOrder?: number;
  userId: string;
  accessToken?: string | null;
}) {
  return upsertAdminTicketTierViaSupabase(input);
}

export async function listAdminTicketOrders(input: {
  userId: string;
  accessToken?: string | null;
  status?: string | null;
  limit?: number;
}) {
  return listAdminTicketOrdersViaSupabase(input);
}

export async function listAdminVendors(input: {
  userId: string;
  accessToken?: string | null;
  query?: string | null;
  activeOnly?: boolean | null;
  limit?: number;
}) {
  if (ENV.DEV_AUTH_MODE) return [];

  const query = new URLSearchParams();
  if (input.limit) query.set("limit", String(input.limit));
  if (input.query) query.set("q", input.query);
  if (typeof input.activeOnly === "boolean") query.set("active_only", String(input.activeOnly));

  const res = await fetch(backendUrl(`/api/admin/vendors${query.size ? `?${query.toString()}` : ""}`), {
    method: "GET",
    headers: adminHeaders({ userId: input.userId, accessToken: input.accessToken }),
  });
  const data = await parseJson<{ status: string; vendors: AdminVendorSummary[] }>(res);
  return data.vendors ?? [];
}

export async function updateAdminVendor(input: {
  vendorId: string;
  patch: Partial<Pick<AdminVendorSummary, "name" | "description" | "supports_market" | "supports_food" | "campus" | "area" | "city" | "is_active">>;
  userId: string;
  accessToken?: string | null;
}) {
  const res = await fetch(backendUrl(`/api/admin/vendors/${encodeURIComponent(input.vendorId)}`), {
    method: "POST",
    headers: adminHeaders({ userId: input.userId, accessToken: input.accessToken, json: true }),
    body: JSON.stringify(input.patch),
  });
  return parseJson<{ status: string; vendor: AdminVendorSummary }>(res);
}

export async function createAdminVendor(input: CreateAdminVendorInput & {
  userId: string;
  accessToken?: string | null;
}) {
  if (ENV.DEV_AUTH_MODE) {
    return {
      id: `dev-vendor-${Date.now()}`,
      owner_id: input.owner_id,
      name: input.name,
      description: input.description ?? null,
      supports_market: input.supports_market ?? true,
      supports_food: input.supports_food ?? false,
      campus: input.campus ?? null,
      area: input.area ?? null,
      city: input.city ?? null,
      latitude: null,
      longitude: null,
      is_active: input.is_active ?? true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    } satisfies AdminVendorSummary;
  }

  const res = await fetch(backendUrl("/api/admin/vendors"), {
    method: "POST",
    headers: adminHeaders({ userId: input.userId, accessToken: input.accessToken, json: true }),
    body: JSON.stringify({
      owner_id: input.owner_id,
      name: input.name,
      description: input.description ?? null,
      supports_market: input.supports_market ?? true,
      supports_food: input.supports_food ?? false,
      campus: input.campus ?? null,
      area: input.area ?? null,
      city: input.city ?? null,
      is_active: input.is_active ?? true,
    }),
  });
  const data = await parseJson<{ status: string; vendor: AdminVendorSummary }>(res);
  return data.vendor;
}

export async function deleteAdminVendor(input: {
  vendorId: string;
  userId: string;
  accessToken?: string | null;
}) {
  const res = await fetch(backendUrl(`/api/admin/vendors/${encodeURIComponent(input.vendorId)}`), {
    method: "DELETE",
    headers: adminHeaders({ userId: input.userId, accessToken: input.accessToken }),
  });
  return parseJson<{ status: string; vendor_id: string }>(res);
}

export async function listAdminCatalogItems(input: {
  userId: string;
  accessToken?: string | null;
  query?: string | null;
  activeOnly?: boolean | null;
  channel?: "market" | "food" | null;
  limit?: number;
}) {
  if (ENV.DEV_AUTH_MODE) return [];

  const query = new URLSearchParams();
  if (input.limit) query.set("limit", String(input.limit));
  if (input.query) query.set("q", input.query);
  if (typeof input.activeOnly === "boolean") query.set("active_only", String(input.activeOnly));
  if (input.channel) query.set("channel", input.channel);

  const res = await fetch(backendUrl(`/api/admin/catalog-items${query.size ? `?${query.toString()}` : ""}`), {
    method: "GET",
    headers: adminHeaders({ userId: input.userId, accessToken: input.accessToken }),
  });
  const data = await parseJson<{ status: string; items: AdminCatalogItemSummary[] }>(res);
  return data.items ?? [];
}

export async function updateAdminCatalogItem(input: {
  itemId: string;
  patch: Partial<Pick<AdminCatalogItemSummary, "name" | "description" | "price_mwk" | "stock_qty" | "image_url" | "image_urls" | "is_active">>;
  userId: string;
  accessToken?: string | null;
}) {
  const res = await fetch(backendUrl(`/api/admin/catalog-items/${encodeURIComponent(input.itemId)}`), {
    method: "POST",
    headers: adminHeaders({ userId: input.userId, accessToken: input.accessToken, json: true }),
    body: JSON.stringify(input.patch),
  });
  return parseJson<{ status: string; item: AdminCatalogItemSummary }>(res);
}

export async function createAdminCatalogItem(input: CreateAdminCatalogItemInput & {
  userId: string;
  accessToken?: string | null;
}) {
  if (ENV.DEV_AUTH_MODE) {
    return {
      id: `dev-item-${Date.now()}`,
      vendor_id: input.vendor_id,
      channel: input.channel,
      name: input.name,
      description: input.description ?? null,
      price_mwk: input.price_mwk,
      stock_qty: input.stock_qty ?? null,
      image_url: input.image_url ?? null,
      image_urls: input.image_urls ?? (input.image_url ? [input.image_url] : []),
      is_active: input.is_active ?? true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    } satisfies AdminCatalogItemSummary;
  }

  const res = await fetch(backendUrl("/api/admin/catalog-items"), {
    method: "POST",
    headers: adminHeaders({ userId: input.userId, accessToken: input.accessToken, json: true }),
    body: JSON.stringify({
      vendor_id: input.vendor_id,
      channel: input.channel,
      name: input.name,
      description: input.description ?? null,
      price_mwk: input.price_mwk,
      stock_qty: input.stock_qty ?? null,
      image_url: input.image_url ?? null,
      image_urls: input.image_urls ?? (input.image_url ? [input.image_url] : []),
      is_active: input.is_active ?? true,
    }),
  });
  const data = await parseJson<{ status: string; item: AdminCatalogItemSummary }>(res);
  return data.item;
}

export async function deleteAdminCatalogItem(input: {
  itemId: string;
  userId: string;
  accessToken?: string | null;
}) {
  const res = await fetch(backendUrl(`/api/admin/catalog-items/${encodeURIComponent(input.itemId)}`), {
    method: "DELETE",
    headers: adminHeaders({ userId: input.userId, accessToken: input.accessToken }),
  });
  return parseJson<{ status: string; item_id: string }>(res);
}

export async function listAdminHousingListings(input: {
  userId: string;
  accessToken?: string | null;
  query?: string | null;
  activeOnly?: boolean | null;
  limit?: number;
}) {
  if (ENV.DEV_AUTH_MODE) return [];

  const query = new URLSearchParams();
  if (input.limit) query.set("limit", String(input.limit));
  if (input.query) query.set("q", input.query);
  if (typeof input.activeOnly === "boolean") query.set("active_only", String(input.activeOnly));

  const res = await fetch(backendUrl(`/api/admin/housing-listings${query.size ? `?${query.toString()}` : ""}`), {
    method: "GET",
    headers: adminHeaders({ userId: input.userId, accessToken: input.accessToken }),
  });
  const data = await parseJson<{ status: string; listings: AdminHousingListingSummary[] }>(res);
  return data.listings ?? [];
}

export async function updateAdminHousingListing(input: {
  listingId: string;
  patch: Partial<Pick<AdminHousingListingSummary, "title" | "description" | "campus" | "area" | "city" | "price_from" | "contact_phone" | "is_active">>;
  userId: string;
  accessToken?: string | null;
}) {
  const res = await fetch(backendUrl(`/api/admin/housing-listings/${encodeURIComponent(input.listingId)}`), {
    method: "POST",
    headers: adminHeaders({ userId: input.userId, accessToken: input.accessToken, json: true }),
    body: JSON.stringify(input.patch),
  });
  return parseJson<{ status: string; listing: AdminHousingListingSummary }>(res);
}

export async function createAdminHousingListing(input: CreateAdminHousingListingInput & {
  userId: string;
  accessToken?: string | null;
}) {
  if (ENV.DEV_AUTH_MODE) {
    return {
      id: `dev-listing-${Date.now()}`,
      landlord_id: input.landlord_id,
      title: input.title,
      listing_type: input.listing_type,
      campus: input.campus ?? null,
      area: input.area ?? null,
      city: input.city ?? null,
      price_from: input.price_from ?? null,
      description: input.description ?? null,
      contact_phone: input.contact_phone,
      is_active: input.is_active ?? true,
      image_urls: [],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      landlord: null,
    } satisfies AdminHousingListingSummary;
  }

  const res = await fetch(backendUrl("/api/admin/housing-listings"), {
    method: "POST",
    headers: adminHeaders({ userId: input.userId, accessToken: input.accessToken, json: true }),
    body: JSON.stringify({
      landlord_id: input.landlord_id,
      title: input.title,
      listing_type: input.listing_type,
      campus: input.campus ?? null,
      area: input.area ?? null,
      city: input.city ?? null,
      price_from: input.price_from ?? null,
      description: input.description ?? null,
      contact_phone: input.contact_phone,
      is_active: input.is_active ?? true,
    }),
  });
  const data = await parseJson<{ status: string; listing: AdminHousingListingSummary }>(res);
  return data.listing;
}

export async function deleteAdminHousingListing(input: {
  listingId: string;
  userId: string;
  accessToken?: string | null;
}) {
  const res = await fetch(backendUrl(`/api/admin/housing-listings/${encodeURIComponent(input.listingId)}`), {
    method: "DELETE",
    headers: adminHeaders({ userId: input.userId, accessToken: input.accessToken }),
  });
  return parseJson<{ status: string; listing_id: string }>(res);
}

export async function listAdminUsers(input: {
  userId: string;
  accessToken?: string | null;
  query?: string | null;
  role?: AdminUserSummary["role"] | null;
  limit?: number;
}) {
  if (ENV.DEV_AUTH_MODE) {
    try {
      return await listAdminUsersViaSupabase(input);
    } catch {
      return [];
    }
  }

  const query = new URLSearchParams();
  if (input.limit) query.set("limit", String(input.limit));
  if (input.query) query.set("q", input.query);
  if (input.role) query.set("role", input.role);

  try {
    const res = await fetch(backendUrl(`/api/admin/users${query.size ? `?${query.toString()}` : ""}`), {
      method: "GET",
      headers: adminHeaders({ userId: input.userId, accessToken: input.accessToken }),
    });
    const data = await parseJson<{ status: string; users: AdminUserSummary[] }>(res);
    return data.users ?? [];
  } catch {
    return listAdminUsersViaSupabase(input);
  }
}

export async function updateAdminUser(input: {
  targetUserId: string;
  patch: Partial<Pick<AdminUserSummary, "full_name" | "phone" | "campus" | "area" | "role" | "onboarded">>;
  userId: string;
  accessToken?: string | null;
}) {
  const res = await fetch(backendUrl(`/api/admin/users/${encodeURIComponent(input.targetUserId)}`), {
    method: "POST",
    headers: adminHeaders({ userId: input.userId, accessToken: input.accessToken, json: true }),
    body: JSON.stringify(input.patch),
  });
  return parseJson<{ status: string; user: AdminUserSummary }>(res);
}

export async function deleteAdminUser(input: {
  targetUserId: string;
  userId: string;
  accessToken?: string | null;
}) {
  const res = await fetch(backendUrl(`/api/admin/users/${encodeURIComponent(input.targetUserId)}`), {
    method: "DELETE",
    headers: adminHeaders({ userId: input.userId, accessToken: input.accessToken }),
  });
  return parseJson<{ status: string; user_id: string }>(res);
}

export async function inviteAdminStaff(input: AdminStaffInviteInput & {
  userId: string;
  accessToken?: string | null;
}) {
  if (ENV.DEV_AUTH_MODE) {
    return {
      status: "success",
      user: {
        id: `dev-invite-${Date.now()}`,
        email: input.email,
        full_name: input.fullName ?? null,
        role: input.role,
      },
    };
  }

  const res = await fetch(backendUrl("/api/admin/users/invite"), {
    method: "POST",
    headers: adminHeaders({ userId: input.userId, accessToken: input.accessToken, json: true }),
    body: JSON.stringify({
      email: input.email,
      full_name: input.fullName ?? null,
      role: input.role,
    }),
  });
  return parseJson<{ status: string; user: Pick<AdminUserSummary, "id" | "email" | "full_name" | "role"> }>(res);
}

export async function broadcastAdminNotification(input: {
  title: string;
  message: string;
  audienceRole: AdminBroadcastAudience;
  priority?: "normal" | "important";
  type?: string;
  userId: string;
  accessToken?: string | null;
}) {
  if (ENV.DEV_AUTH_MODE) {
    return { status: "success", sent_to: 0, audience_role: input.audienceRole };
  }

  try {
    const res = await fetch(backendUrl("/api/admin/broadcast"), {
      method: "POST",
      headers: adminHeaders({ userId: input.userId, accessToken: input.accessToken, json: true }),
      body: JSON.stringify({
        title: input.title,
        message: input.message,
        audience_role: input.audienceRole,
        priority: input.priority ?? "normal",
        type: input.type ?? "system",
      }),
    });
    const result = await parseJson<AdminBroadcastResponse>(res);
    const expectedRecipients = await listBroadcastRecipientIds(input.audienceRole).catch(() => []);
    const sentTo = Number(result.sent_to ?? 0);
    const profileRecipientShortfall = expectedRecipients.length > 0 && sentTo < expectedRecipients.length;
    const profileOnlyAllBroadcast = input.audienceRole === "all" && result.recipient_source !== "auth_users" && sentTo <= 1;
    if (profileRecipientShortfall || profileOnlyAllBroadcast) {
      return broadcastViaSupabase({
        title: input.title,
        message: input.message,
        audienceRole: input.audienceRole,
        priority: input.priority,
        type: input.type,
      });
    }
    return result;
  } catch (error) {
    if (isMissingEndpointError(error)) {
      return broadcastViaSupabase({
        title: input.title,
        message: input.message,
        audienceRole: input.audienceRole,
        priority: input.priority,
        type: input.type,
      });
    }
    throw error;
  }
}
