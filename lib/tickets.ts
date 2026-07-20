import AsyncStorage from "@react-native-async-storage/async-storage";
import { kwacha } from "@/lib/currency";
import { ENV } from "@/lib/env";
import { supabase } from "@/lib/supabase";

export type TicketTier = {
  id: string;
  eventId?: string;
  name: string;
  priceMwk: number;
  description: string;
  available: boolean;
  capacityTotal?: number;
  capacitySold?: number;
  capacityReserved?: number;
  remaining?: number;
};

export type TicketEvent = {
  id: string;
  title: string;
  category: string;
  description?: string;
  dateLabel: string;
  startsAt?: string | null;
  endsAt?: string | null;
  venue: string;
  city: string;
  image: string;
  heroImage: string;
  rating: number;
  status?: string;
  tiers: TicketTier[];
};

export type TicketPaymentMethod = "airtel_money" | "mpamba" | "bank_transfer";

export type TicketOrder = {
  id: string;
  user_id: string;
  event_id: string;
  tier_id: string;
  quantity: number;
  unit_price_mwk: number;
  service_fee_mwk: number;
  total_mwk: number;
  status: string;
  payment_status: string;
  payment_reference: string | null;
  reserved_until: string;
  paid_at: string | null;
  created_at: string;
};

export type TicketPaymentSession = {
  order: TicketOrder;
  event: Partial<TicketEvent> & Record<string, unknown>;
  tier: Partial<TicketTier> & Record<string, unknown>;
  txRef: string;
  paymentId: string;
  checkoutUrl: string | null;
  directCharge: {
    status: string;
    providerReference: string | null;
    paymentAccountDetails: Record<string, unknown> | null;
    authorization: Record<string, unknown> | null;
  };
};

type TicketPaymentInput = {
  eventId: string;
  tierId: string;
  quantity: number;
  paymentMethod: TicketPaymentMethod;
  phone?: string | null;
};

export type IssuedTicket = {
  id: string;
  order_id: string;
  event_id: string;
  tier_id: string;
  ticket_code: string;
  qr_data_url?: string | null;
  status: string;
  checked_in_at: string | null;
  issued_at: string;
  event?: {
    title: string;
    category: string;
    date_label: string;
    description?: string | null;
    starts_at?: string | null;
    ends_at?: string | null;
    venue: string;
    city: string;
    image_url: string;
    hero_image_url: string;
  } | null;
  tier?: {
    name: string;
    price_mwk: number;
  } | null;
  order?: {
    id: string;
    total_mwk: number;
    quantity: number;
    status: string;
    payment_status: string;
    paid_at: string | null;
  } | null;
};

export type TicketOrderDetail = {
  status: string;
  payment_status?: string;
  fulfilled?: boolean;
  order: TicketOrder;
  event: Record<string, unknown>;
  tier: Record<string, unknown>;
  tickets: IssuedTicket[];
};

const MY_TICKETS_CACHE_PREFIX = "eya.myTickets.v1";
const TICKET_REQUEST_TIMEOUT_MS = 4500;

function myTicketsCacheKey(userId: string) {
  return `${MY_TICKETS_CACHE_PREFIX}:${userId}`;
}

function sortIssuedTickets(rows: IssuedTicket[]) {
  return [...rows].sort((a, b) => {
    const bTime = Date.parse(b.issued_at || b.order?.paid_at || "");
    const aTime = Date.parse(a.issued_at || a.order?.paid_at || "");
    return (Number.isFinite(bTime) ? bTime : 0) - (Number.isFinite(aTime) ? aTime : 0);
  });
}

function validIssuedTickets(value: unknown): IssuedTicket[] {
  if (!Array.isArray(value)) return [];
  return value.filter((row): row is IssuedTicket => {
    if (!row || typeof row !== "object") return false;
    const ticket = row as Partial<IssuedTicket>;
    return typeof ticket.id === "string" && typeof ticket.ticket_code === "string";
  });
}

function mergeIssuedTickets(existing: IssuedTicket[], incoming: IssuedTicket[]) {
  const byKey = new Map<string, IssuedTicket>();
  [...existing, ...incoming].forEach((ticket) => {
    const key = ticket.id || ticket.ticket_code;
    if (key) byKey.set(key, ticket);
  });
  return sortIssuedTickets([...byKey.values()]);
}

export async function getCachedMyTickets(userId: string | null | undefined): Promise<IssuedTicket[]> {
  if (!userId) return [];
  try {
    const raw = await AsyncStorage.getItem(myTicketsCacheKey(userId));
    if (!raw) return [];
    return sortIssuedTickets(validIssuedTickets(JSON.parse(raw)));
  } catch {
    return [];
  }
}

export async function cacheMyTickets(userId: string | null | undefined, tickets: IssuedTicket[]) {
  if (!userId) return;
  await AsyncStorage.setItem(myTicketsCacheKey(userId), JSON.stringify(sortIssuedTickets(validIssuedTickets(tickets))));
}

export async function appendCachedMyTickets(userId: string | null | undefined, tickets: IssuedTicket[]) {
  if (!userId || !tickets.length) return;
  const existing = await getCachedMyTickets(userId);
  await cacheMyTickets(userId, mergeIssuedTickets(existing, tickets));
}

function getBackendBaseUrl() {
  if (!ENV.PAYCHANGU_BACKEND) {
    throw new Error("Backend URL is not configured. Set EXPO_PUBLIC_PAYCHANGU_BACKEND.");
  }
  return ENV.PAYCHANGU_BACKEND.replace(/\/+$/, "");
}

async function parseJson(res: Response) {
  return res.json().catch(() => ({}));
}

async function fetchWithTimeout(input: RequestInfo | URL, init: RequestInit = {}, timeoutMs = TICKET_REQUEST_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

function parseError(payload: any) {
  if (!payload || typeof payload !== "object") return null;
  return payload.message || payload.error || payload.detail || null;
}

function parseNetworkError(error: unknown, fallback: string) {
  if (!error) return fallback;
  if (typeof error === "string") return error;
  if (error instanceof Error) return error.message || fallback;
  if (typeof error === "object") return parseError(error) || fallback;
  return String(error) || fallback;
}

function isTicketBackendUnavailable(error: unknown) {
  if (error instanceof Error && error.name === "AbortError") return true;
  const message = parseNetworkError(error, "").toLowerCase();
  return (
    message.includes("404") ||
    message.includes("abort") ||
    message.includes("timeout") ||
    message.includes("backend url is not configured") ||
    message.includes("cannot get /api/tickets") ||
    message.includes("network request failed") ||
    message.includes("failed to fetch")
  );
}

function supabaseRestHeaders(accessToken: string) {
  return {
    apikey: ENV.SUPABASE_ANON_KEY,
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
  };
}

async function readSupabaseRest<T>(res: Response, fallback: string): Promise<T> {
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(parseError(data) || fallback || `Supabase request failed (${res.status}).`);
  }
  return data as T;
}

function normalizeLiveEvent(row: any): TicketEvent {
  return {
    id: String(row.id),
    title: String(row.title || "Event"),
    category: String(row.category || "Event"),
    description: String(row.description || ""),
    dateLabel: String(row.dateLabel || row.date_label || ""),
    startsAt: typeof row.startsAt === "string" ? row.startsAt : typeof row.starts_at === "string" ? row.starts_at : null,
    endsAt: typeof row.endsAt === "string" ? row.endsAt : typeof row.ends_at === "string" ? row.ends_at : null,
    venue: String(row.venue || ""),
    city: String(row.city || ""),
    image: String(row.image || row.image_url || ""),
    heroImage: String(row.heroImage || row.hero_image_url || row.image || row.image_url || ""),
    rating: Number(row.rating || 4.8),
    status: typeof row.status === "string" ? row.status : undefined,
    tiers: Array.isArray(row.tiers)
      ? row.tiers.map((tier: any) => {
          const capacityTotal = Number(tier.capacityTotal ?? tier.capacity_total ?? 0);
          const capacitySold = Number(tier.capacitySold ?? tier.capacity_sold ?? 0);
          const capacityReserved = Number(tier.capacityReserved ?? tier.capacity_reserved ?? 0);
          const computedRemaining = Math.max(0, capacityTotal - capacitySold - capacityReserved);
          const remaining = Number.isFinite(Number(tier.remaining)) ? Number(tier.remaining) : computedRemaining;
          return {
            id: String(tier.id),
            eventId: typeof tier.eventId === "string" ? tier.eventId : typeof tier.event_id === "string" ? tier.event_id : undefined,
            name: String(tier.name || "Ticket"),
            priceMwk: Number(tier.priceMwk ?? tier.price_mwk ?? 0),
            description: String(tier.description || ""),
            available: tier.available !== false && capacityTotal > capacitySold && computedRemaining > 0,
            capacityTotal,
            capacitySold,
            capacityReserved,
            remaining,
          };
        })
      : [],
  };
}

function normalizeTicketOrder(row: any): TicketOrder {
  return {
    id: String(row?.id ?? ""),
    user_id: String(row?.user_id ?? ""),
    event_id: String(row?.event_id ?? ""),
    tier_id: String(row?.tier_id ?? ""),
    quantity: Number(row?.quantity ?? 0),
    unit_price_mwk: Number(row?.unit_price_mwk ?? 0),
    service_fee_mwk: Number(row?.service_fee_mwk ?? 0),
    total_mwk: Number(row?.total_mwk ?? 0),
    status: String(row?.status ?? ""),
    payment_status: String(row?.payment_status ?? ""),
    payment_reference: typeof row?.payment_reference === "string" ? row.payment_reference : null,
    reserved_until: String(row?.reserved_until ?? ""),
    paid_at: typeof row?.paid_at === "string" ? row.paid_at : null,
    created_at: String(row?.created_at ?? ""),
  };
}

function normalizeOrderEvent(row: any) {
  const event = row && typeof row === "object" ? row : {};
  return {
    id: typeof event.id === "string" ? event.id : "",
    title: String(event.title || "Event"),
    category: String(event.category || "Event"),
    description: typeof event.description === "string" ? event.description : "",
    date_label: String(event.date_label || event.dateLabel || ""),
    starts_at: typeof event.starts_at === "string" ? event.starts_at : typeof event.startsAt === "string" ? event.startsAt : null,
    ends_at: typeof event.ends_at === "string" ? event.ends_at : typeof event.endsAt === "string" ? event.endsAt : null,
    venue: String(event.venue || ""),
    city: String(event.city || ""),
    image_url: String(event.image_url || event.image || ""),
    hero_image_url: String(event.hero_image_url || event.heroImage || event.image_url || event.image || ""),
  };
}

function normalizeOrderTier(row: any) {
  const tier = row && typeof row === "object" ? row : {};
  return {
    id: typeof tier.id === "string" ? tier.id : "",
    name: String(tier.name || "Ticket"),
    description: String(tier.description || ""),
    price_mwk: Number(tier.price_mwk ?? tier.priceMwk ?? 0),
  };
}

function normalizeTicketOrderDetail(row: any): TicketOrderDetail {
  const order = normalizeTicketOrder(row?.order);
  const event = normalizeOrderEvent(row?.event);
  const tier = normalizeOrderTier(row?.tier);
  const tickets = Array.isArray(row?.tickets) ? row.tickets : [];
  const issuedAtFallback = order.paid_at || order.created_at || new Date().toISOString();

  return {
    status: String(row?.status || "success"),
    payment_status: typeof row?.payment_status === "string" ? row.payment_status : order.payment_status,
    fulfilled: typeof row?.fulfilled === "boolean" ? row.fulfilled : tickets.length > 0 && order.payment_status === "paid",
    order,
    event,
    tier,
    tickets: tickets
      .map((ticket: any) => ({
        id: String(ticket?.id || ""),
        order_id: String(ticket?.order_id || order.id),
        event_id: String(ticket?.event_id || order.event_id),
        tier_id: String(ticket?.tier_id || order.tier_id),
        ticket_code: String(ticket?.ticket_code || ""),
        qr_data_url: typeof ticket?.qr_data_url === "string" ? ticket.qr_data_url : null,
        status: String(ticket?.status || "active"),
        checked_in_at: typeof ticket?.checked_in_at === "string" ? ticket.checked_in_at : null,
        issued_at: String(ticket?.issued_at || issuedAtFallback),
        event,
        tier,
        order: {
          id: order.id,
          total_mwk: Number(order.total_mwk || 0),
          quantity: Number(order.quantity || 0),
          status: order.status,
          payment_status: order.payment_status,
          paid_at: order.paid_at,
        },
      }))
      .filter((ticket: IssuedTicket) => ticket.id && ticket.ticket_code),
  };
}

async function getCurrentTicketUser(accessToken: string) {
  const { data, error } = await supabase.auth.getUser(accessToken);
  if (error) throw new Error(error.message);
  if (!data?.user?.id) throw new Error("Invalid session.");
  return data.user;
}

async function listTicketEventsFromSupabase(query = "") {
  const term = query.trim();
  let request = supabase
    .from("ticket_events")
    .select("id,title,category,description,date_label,starts_at,ends_at,venue,city,image_url,hero_image_url,status,sort_order,metadata,created_at,updated_at")
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

  const eventIds = rows.map((row) => String(row.id || "")).filter(Boolean);
  const { data: tierRows, error: tierError } = await supabase
    .from("ticket_tiers")
    .select("id,event_id,name,description,price_mwk,capacity_total,capacity_sold,capacity_reserved,available,sort_order")
    .in("event_id", eventIds)
    .order("sort_order", { ascending: true });
  if (tierError) throw new Error(tierError.message);

  const tiersByEvent = new Map<string, any[]>();
  ((tierRows ?? []) as any[]).forEach((tier) => {
    const eventId = String(tier.event_id || "");
    if (!eventId) return;
    const current = tiersByEvent.get(eventId) ?? [];
    current.push(tier);
    tiersByEvent.set(eventId, current);
  });

  return rows.map((event) => normalizeLiveEvent({ ...event, tiers: tiersByEvent.get(String(event.id)) ?? [] }));
}

async function listTicketEventsFromBackend(query = "") {
  const params = new URLSearchParams();
  if (query.trim()) params.set("q", query.trim());
  const res = await fetch(`${getBackendBaseUrl()}/api/tickets/events${params.size ? `?${params.toString()}` : ""}`);
  const data = await parseJson(res);
  if (!res.ok) {
    throw new Error(parseError(data) || `Could not load tickets (${res.status}).`);
  }
  const rows = Array.isArray(data?.events) ? data.events : [];
  return rows.map(normalizeLiveEvent);
}

async function createTicketOrderPaymentViaEdgeFunction(
  accessToken: string,
  input: TicketPaymentInput,
): Promise<TicketPaymentSession> {
  const endpoint = `${ENV.SUPABASE_URL.replace(/\/+$/, "")}/functions/v1/create-payment-checkout`;
  const res = await fetchWithTimeout(
    endpoint,
    {
      method: "POST",
      headers: {
        apikey: ENV.SUPABASE_ANON_KEY,
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        event_id: input.eventId,
        tier_id: input.tierId,
        quantity: input.quantity,
        payment_method: input.paymentMethod,
        phone: input.phone ?? null,
      }),
    },
    15_000,
  );

  const data = await parseJson(res);
  if (!res.ok) {
    throw new Error(parseError(data) || `Could not create ticket checkout (${res.status}).`);
  }

  const order = normalizeTicketOrder(data?.order);
  const txRef = typeof data?.tx_ref === "string" ? data.tx_ref.trim() : "";
  const checkoutUrl = typeof data?.checkout_url === "string" ? data.checkout_url.trim() : "";

  if (!order.id) throw new Error("Ticket checkout did not return an order.");
  if (!txRef) throw new Error("Ticket checkout did not return a payment reference.");
  if (!/^https:\/\//i.test(checkoutUrl)) throw new Error("Ticket checkout did not return a secure checkout URL.");

  return {
    order,
    event: data?.event && typeof data.event === "object" ? data.event : {},
    tier: data?.tier && typeof data.tier === "object" ? data.tier : {},
    txRef,
    paymentId: typeof data?.payment_id === "string" ? data.payment_id : "",
    checkoutUrl,
    directCharge: {
      status: String(data?.direct_charge?.status || "pending"),
      providerReference:
        typeof data?.direct_charge?.provider_reference === "string"
          ? data.direct_charge.provider_reference
          : null,
      paymentAccountDetails: null,
      authorization: null,
    },
  };
}

async function getTicketOrderPaymentDetailViaSupabase(accessToken: string, orderId: string) {
  const baseUrl = ENV.SUPABASE_URL.replace(/\/+$/, "");
  const orderUrl = new URL(`${baseUrl}/rest/v1/ticket_orders`);
  orderUrl.searchParams.set("select", "id,user_id,event_id,tier_id,quantity,unit_price_mwk,service_fee_mwk,total_mwk,status,payment_status,payment_reference,reserved_until,paid_at,created_at");
  orderUrl.searchParams.set("id", `eq.${orderId}`);
  orderUrl.searchParams.set("limit", "1");
  const orderRows = await readSupabaseRest<any[]>(
    await fetch(orderUrl.toString(), { headers: supabaseRestHeaders(accessToken) }),
    "Could not load ticket order.",
  );
  const order = normalizeTicketOrder(orderRows?.[0]);
  if (!order.id) throw new Error("Ticket order not found.");

  const ticketUrl = new URL(`${baseUrl}/rest/v1/issued_tickets`);
  ticketUrl.searchParams.set("select", "id,ticket_code,status,checked_in_at,issued_at");
  ticketUrl.searchParams.set("order_id", `eq.${orderId}`);
  ticketUrl.searchParams.set("order", "issued_at.asc");
  const tickets = await readSupabaseRest<any[]>(
    await fetch(ticketUrl.toString(), { headers: supabaseRestHeaders(accessToken) }),
    "Could not load issued tickets.",
  );

  const eventUrl = new URL(`${baseUrl}/rest/v1/ticket_events`);
  eventUrl.searchParams.set("select", "id,title,category,description,date_label,starts_at,ends_at,venue,city,image_url,hero_image_url");
  eventUrl.searchParams.set("id", `eq.${order.event_id}`);
  eventUrl.searchParams.set("limit", "1");
  const eventRows = await readSupabaseRest<any[]>(
    await fetch(eventUrl.toString(), { headers: supabaseRestHeaders(accessToken) }),
    "Could not load ticket event.",
  );

  const tierUrl = new URL(`${baseUrl}/rest/v1/ticket_tiers`);
  tierUrl.searchParams.set("select", "id,name,description,price_mwk");
  tierUrl.searchParams.set("id", `eq.${order.tier_id}`);
  tierUrl.searchParams.set("limit", "1");
  const tierRows = await readSupabaseRest<any[]>(
    await fetch(tierUrl.toString(), { headers: supabaseRestHeaders(accessToken) }),
    "Could not load ticket tier.",
  );

  return {
    status: "success",
    payment_status: order.payment_status,
    fulfilled: tickets.length > 0 && order.payment_status === "paid",
    order,
    event: eventRows?.[0] ?? {},
    tier: tierRows?.[0] ?? {},
    tickets: tickets.map((ticket) => ({
      id: String(ticket.id),
      order_id: order.id,
      event_id: order.event_id,
      tier_id: order.tier_id,
      ticket_code: String(ticket.ticket_code),
      qr_data_url: null,
      status: String(ticket.status || "active"),
      checked_in_at: typeof ticket.checked_in_at === "string" ? ticket.checked_in_at : null,
      issued_at: String(ticket.issued_at || order.paid_at || new Date().toISOString()),
    })),
  };
}

function inFilter(values: string[]) {
  return `in.(${values.map((value) => `"${value.replace(/"/g, '\\"')}"`).join(",")})`;
}

async function listMyTicketsFromSupabase(accessToken: string): Promise<IssuedTicket[]> {
  const baseUrl = ENV.SUPABASE_URL.replace(/\/+$/, "");
  const ticketUrl = new URL(`${baseUrl}/rest/v1/issued_tickets`);
  ticketUrl.searchParams.set("select", "id,order_id,event_id,tier_id,ticket_code,status,checked_in_at,issued_at");
  ticketUrl.searchParams.set("order", "issued_at.desc");
  ticketUrl.searchParams.set("limit", "200");

  const ticketRows = await readSupabaseRest<any[]>(
    await fetchWithTimeout(ticketUrl.toString(), { headers: supabaseRestHeaders(accessToken) }),
    "Could not load your tickets.",
  );
  const rows = Array.isArray(ticketRows) ? ticketRows : [];
  if (!rows.length) return [];

  const eventIds = [...new Set(rows.map((row) => String(row.event_id || "")).filter(Boolean))];
  const tierIds = [...new Set(rows.map((row) => String(row.tier_id || "")).filter(Boolean))];
  const orderIds = [...new Set(rows.map((row) => String(row.order_id || "")).filter(Boolean))];

  const eventsUrl = new URL(`${baseUrl}/rest/v1/ticket_events`);
  eventsUrl.searchParams.set("select", "id,title,category,description,date_label,starts_at,ends_at,venue,city,image_url,hero_image_url");
  eventsUrl.searchParams.set("id", inFilter(eventIds));

  const tiersUrl = new URL(`${baseUrl}/rest/v1/ticket_tiers`);
  tiersUrl.searchParams.set("select", "id,name,price_mwk");
  tiersUrl.searchParams.set("id", inFilter(tierIds));

  const ordersUrl = new URL(`${baseUrl}/rest/v1/ticket_orders`);
  ordersUrl.searchParams.set("select", "id,total_mwk,quantity,status,payment_status,paid_at");
  ordersUrl.searchParams.set("id", inFilter(orderIds));

  const [events, tiers, orders] = await Promise.all([
    eventIds.length
      ? readSupabaseRest<any[]>(await fetchWithTimeout(eventsUrl.toString(), { headers: supabaseRestHeaders(accessToken) }), "Could not load ticket events.")
      : Promise.resolve([]),
    tierIds.length
      ? readSupabaseRest<any[]>(await fetchWithTimeout(tiersUrl.toString(), { headers: supabaseRestHeaders(accessToken) }), "Could not load ticket types.")
      : Promise.resolve([]),
    orderIds.length
      ? readSupabaseRest<any[]>(await fetchWithTimeout(ordersUrl.toString(), { headers: supabaseRestHeaders(accessToken) }), "Could not load ticket orders.")
      : Promise.resolve([]),
  ]);

  const eventById = new Map((events || []).map((event) => [String(event.id), event]));
  const tierById = new Map((tiers || []).map((tier) => [String(tier.id), tier]));
  const orderById = new Map((orders || []).map((order) => [String(order.id), order]));

  return sortIssuedTickets(
    rows
      .map((ticket): IssuedTicket => {
        const event = eventById.get(String(ticket.event_id || ""));
        const tier = tierById.get(String(ticket.tier_id || ""));
        const order = orderById.get(String(ticket.order_id || ""));
        return {
          id: String(ticket.id || ""),
          order_id: String(ticket.order_id || ""),
          event_id: String(ticket.event_id || ""),
          tier_id: String(ticket.tier_id || ""),
          ticket_code: String(ticket.ticket_code || ""),
          qr_data_url: null,
          status: String(ticket.status || "active"),
          checked_in_at: typeof ticket.checked_in_at === "string" ? ticket.checked_in_at : null,
          issued_at: String(ticket.issued_at || order?.paid_at || new Date().toISOString()),
          event: event
            ? {
                title: String(event.title || "Event"),
                category: String(event.category || "Event"),
                date_label: String(event.date_label || ""),
                description: typeof event.description === "string" ? event.description : null,
                starts_at: typeof event.starts_at === "string" ? event.starts_at : null,
                ends_at: typeof event.ends_at === "string" ? event.ends_at : null,
                venue: String(event.venue || ""),
                city: String(event.city || ""),
                image_url: String(event.image_url || ""),
                hero_image_url: String(event.hero_image_url || event.image_url || ""),
              }
            : null,
          tier: tier
            ? {
                name: String(tier.name || "Ticket"),
                price_mwk: Number(tier.price_mwk || 0),
              }
            : null,
          order: order
            ? {
                id: String(order.id || ""),
                total_mwk: Number(order.total_mwk || 0),
                quantity: Number(order.quantity || 0),
                status: String(order.status || ""),
                payment_status: String(order.payment_status || ""),
                paid_at: typeof order.paid_at === "string" ? order.paid_at : null,
              }
            : null,
        };
      })
      .filter((ticket) => Boolean(ticket.id && ticket.ticket_code)),
  );
}

export const ticketEvents: TicketEvent[] = [
  {
    id: "melodies-mimosas",
    title: "Melodies & Mimosas",
    category: "Festival",
    description: "A music and lifestyle festival experience with live performances, food, and premium social spaces.",
    dateLabel: "25 May - 6 Sept 2026",
    venue: "Stakeout",
    city: "Blantyre",
    image: "https://images.unsplash.com/photo-1501281668745-f7f57925c3b4?auto=format&fit=crop&w=900&q=80",
    heroImage: "https://images.unsplash.com/photo-1533174072545-7a4b6ad7a6c3?auto=format&fit=crop&w=1400&q=80",
    rating: 4.8,
    tiers: [
      { id: "standard", name: "Phase 1 Standard", priceMwk: 50000, description: "Early access ticket with venue entry.", available: true },
      { id: "vip", name: "VIP Tickets", priceMwk: 300000, description: "VIP access with closer stage view.", available: true },
      { id: "golden", name: "Golden Circle", priceMwk: 150000, description: "Closer to the stage with premium experience.", available: false },
    ],
  },
  {
    id: "legacy-concert",
    title: "Lulu @ 25 The Legacy Concert",
    category: "Music",
    description: "A live concert celebrating a legacy of Malawian music with standard and VIP seating.",
    dateLabel: "29 May - 31 Aug 2026",
    venue: "BICC",
    city: "Lilongwe",
    image: "https://images.unsplash.com/photo-1506157786151-b8491531f063?auto=format&fit=crop&w=900&q=80",
    heroImage: "https://images.unsplash.com/photo-1492684223066-81342ee5ff30?auto=format&fit=crop&w=1400&q=80",
    rating: 4.7,
    tiers: [
      { id: "standard", name: "Standard", priceMwk: 40000, description: "General concert entry.", available: true },
      { id: "vip", name: "VIP", priceMwk: 120000, description: "VIP seating and priority entrance.", available: true },
    ],
  },
  {
    id: "landlord-pakwao",
    title: "Landlord Pakwao Concert",
    category: "Music",
    description: "A high-energy live concert in Lilongwe with general entry and VIP ticket options.",
    dateLabel: "1 Aug - 2 Aug 2026",
    venue: "Gateway Mall",
    city: "Lilongwe",
    image: "https://images.unsplash.com/photo-1524368535928-5b5e00ddc76b?auto=format&fit=crop&w=900&q=80",
    heroImage: "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?auto=format&fit=crop&w=1400&q=80",
    rating: 4.9,
    tiers: [
      { id: "phase-1", name: "Phase 1 Standard", priceMwk: 50000, description: "Standard entry ticket.", available: true },
      { id: "vip", name: "VIP", priceMwk: 180000, description: "VIP entry with premium section.", available: true },
    ],
  },
];

export function ticketPriceLabel(event: TicketEvent) {
  const prices = event.tiers.filter((tier) => tier.available).map((tier) => tier.priceMwk);
  if (!prices.length) return "Sold out";
  return `From ${kwacha(Math.min(...prices))}`;
}

export async function listTicketEvents(query = ""): Promise<TicketEvent[]> {
  try {
    return await listTicketEventsFromSupabase(query);
  } catch (supabaseError) {
    try {
      return await listTicketEventsFromBackend(query);
    } catch {
      throw supabaseError instanceof Error ? supabaseError : new Error("Could not load ticket events.");
    }
  }
}

export async function createTicketOrderPayment(
  accessToken: string,
  input: TicketPaymentInput,
): Promise<TicketPaymentSession> {
  return createTicketOrderPaymentViaEdgeFunction(accessToken, input);
}

export async function getTicketOrderDetail(accessToken: string, orderId: string): Promise<TicketOrderDetail> {
  try {
    const res = await fetch(`${getBackendBaseUrl()}/api/tickets/orders/${encodeURIComponent(orderId)}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
    const data = await parseJson(res);
    if (!res.ok) {
      throw new Error(parseError(data) || `Could not load ticket order (${res.status}).`);
    }
    return normalizeTicketOrderDetail(data);
  } catch (error) {
    if (!isTicketBackendUnavailable(error)) throw error;
    return normalizeTicketOrderDetail(await getTicketOrderPaymentDetailViaSupabase(accessToken, orderId));
  }
}

export async function verifyTicketOrderPayment(
  accessToken: string,
  orderId: string,
  _txRef?: string | null,
) {
  // Payment truth now comes only from the signed VAC callback. The client may
  // read its own EYA order state, but it cannot verify PayChangu or issue tickets.
  return getTicketOrderPaymentDetailViaSupabase(accessToken, orderId);
}

export async function listMyTickets(accessToken: string): Promise<IssuedTicket[]> {
  try {
    const res = await fetchWithTimeout(`${getBackendBaseUrl()}/api/tickets/my`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
    const data = await parseJson(res);
    if (!res.ok) {
      if (res.status === 404) {
        return listMyTicketsFromSupabase(accessToken);
      }
      throw new Error(parseError(data) || `Could not load your tickets (${res.status}).`);
    }
    return Array.isArray(data?.tickets) ? sortIssuedTickets(validIssuedTickets(data.tickets)) : [];
  } catch (error) {
    if (!isTicketBackendUnavailable(error)) throw error;
    return listMyTicketsFromSupabase(accessToken);
  }
}
