import { requireAuthenticatedUser, statusFromError } from "./auth.js";
import {
  getTicketOrderForUser,
  listMyIssuedTickets,
  listPublishedTicketEvents,
} from "./tickets.js";

function sendError(res, status, message) {
  return res.status(status).json({ status: "error", error: message, message });
}

function stripStaticAdmissionArtifacts(ticket) {
  if (!ticket || typeof ticket !== "object") return ticket;
  const { qr_data_url: _legacyQr, ...safeTicket } = ticket;
  return safeTicket;
}

export function registerTicketReadRoutes(app) {
  app.get("/api/tickets/events", async (req, res) => {
    try {
      const events = await listPublishedTicketEvents({
        query: typeof req.query.q === "string" ? req.query.q : "",
        limit: req.query.limit,
      });
      return res.json({ status: "success", events });
    } catch (error) {
      return sendError(res, 500, error instanceof Error ? error.message : "Could not load ticket events.");
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
      return sendError(res, statusFromError(error, 403), error instanceof Error ? error.message : "Could not load ticket order.");
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
      return sendError(res, statusFromError(error, 401), error instanceof Error ? error.message : "Could not load your tickets.");
    }
  });
}
