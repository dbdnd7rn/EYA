import { requireAuthenticatedUser, statusFromError } from "./auth.js";
import {
  getTicketOrderForUser,
  listMyIssuedTickets,
} from "./tickets.js";
import { supabase } from "./supabase.js";

function sendError(res, status, message) {
  return res.status(status).json({ status: "error", error: message, message });
}

function stripStaticAdmissionArtifacts(ticket) {
  if (!ticket || typeof ticket !== "object") return ticket;
  const { qr_data_url: _legacyQr, ...safeTicket } = ticket;
  return safeTicket;
}

function normalizePublicSearchTerm(value) {
  return String(value || "")
    .trim()
    .slice(0, 80)
    .replace(/[^\p{L}\p{N}\s'&-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizePublicTicketEvent(row, tiers = []) {
  return {
    id: row.id,
    title: row.title,
    category: row.category,
    description: row.description || "",
    dateLabel: row.date_label,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    venue: row.venue,
    city: row.city,
    image: row.image_url,
    heroImage: row.hero_image_url,
    status: row.status,
    rating: Number(row.metadata?.rating || 4.8),
    tiers: tiers.map((tier) => ({
      id: tier.id,
      eventId: tier.event_id,
      name: tier.name,
      priceMwk: Number(tier.price_mwk || 0),
      description: tier.description || "",
      available:
        Boolean(tier.available) &&
        Number(tier.capacity_total || 0) > Number(tier.capacity_sold || 0),
      capacityTotal: Number(tier.capacity_total || 0),
      capacitySold: Number(tier.capacity_sold || 0),
      capacityReserved: Number(tier.capacity_reserved || 0),
      remaining: Math.max(
        0,
        Number(tier.capacity_total || 0) -
          Number(tier.capacity_sold || 0) -
          Number(tier.capacity_reserved || 0),
      ),
    })),
  };
}

async function listPublishedTicketEventsForApi({ query = "", limit = 50 } = {}) {
  // Reservation cleanup is best-effort for public discovery. Supabase query
  // builders are awaitable but do not expose native Promise .catch().
  try {
    await supabase.rpc("release_expired_ticket_reservations");
  } catch {
    // Do not take event discovery offline if cleanup transport is unavailable.
  }

  const normalizedLimit = Math.min(Math.max(Number(limit || 50), 1), 100);
  const term = normalizePublicSearchTerm(query);

  let request = supabase
    .from("ticket_events")
    .select(
      "id,title,category,description,date_label,starts_at,ends_at,venue,city,image_url,hero_image_url,status,sort_order,metadata,created_at,updated_at",
    )
    .eq("status", "published")
    .order("sort_order", { ascending: true })
    .order("starts_at", { ascending: true, nullsFirst: false })
    .limit(normalizedLimit);

  if (term) {
    request = request.or(
      `title.ilike.%${term}%,category.ilike.%${term}%,venue.ilike.%${term}%,city.ilike.%${term}%`,
    );
  }

  const { data: events, error: eventError } = await request;
  if (eventError) throw new Error(eventError.message || "Could not load ticket events.");

  const rows = events || [];
  if (!rows.length) return [];

  const eventIds = rows.map((row) => row.id);
  const { data: tiers, error: tierError } = await supabase
    .from("ticket_tiers")
    .select(
      "id,event_id,name,description,price_mwk,capacity_total,capacity_sold,capacity_reserved,available,sort_order,sale_starts_at,sale_ends_at",
    )
    .in("event_id", eventIds)
    .order("sort_order", { ascending: true });
  if (tierError) throw new Error(tierError.message || "Could not load ticket tiers.");

  const tiersByEvent = new Map();
  for (const tier of tiers || []) {
    const current = tiersByEvent.get(tier.event_id) || [];
    current.push(tier);
    tiersByEvent.set(tier.event_id, current);
  }

  return rows.map((event) =>
    normalizePublicTicketEvent(event, tiersByEvent.get(event.id) || []),
  );
}

export function registerTicketReadRoutes(app) {
  app.get("/api/tickets/events", async (req, res) => {
    try {
      const events = await listPublishedTicketEventsForApi({
        query: typeof req.query.q === "string" ? req.query.q : "",
        limit: req.query.limit,
      });
      return res.json({ status: "success", events });
    } catch (error) {
      return sendError(
        res,
        500,
        error instanceof Error ? error.message : "Could not load ticket events.",
      );
    }
  });

  app.get("/api/tickets/orders/:orderId", async (req, res) => {
    try {
      const { user, profile } = await requireAuthenticatedUser(req);
      const detail = await getTicketOrderForUser(
        String(req.params.orderId || ""),
        user.id,
        profile?.role === "admin",
      );
      if (!detail) return sendError(res, 404, "Ticket order not found.");

      return res.json({
        status: "success",
        ...detail,
        tickets: (detail.tickets || []).map(stripStaticAdmissionArtifacts),
      });
    } catch (error) {
      return sendError(
        res,
        statusFromError(error, 403),
        error instanceof Error ? error.message : "Could not load ticket order.",
      );
    }
  });

  app.get("/api/tickets/my", async (req, res) => {
    try {
      const { user } = await requireAuthenticatedUser(req);
      const tickets = await listMyIssuedTickets(user.id);
      return res.json({
        status: "success",
        tickets: (tickets || []).map(stripStaticAdmissionArtifacts),
      });
    } catch (error) {
      return sendError(
        res,
        statusFromError(error, 401),
        error instanceof Error ? error.message : "Could not load your tickets.",
      );
    }
  });
}
