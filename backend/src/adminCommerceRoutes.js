import { getProfileById, requireAdmin, statusFromError } from "./auth.js";
import { getOrderDetailPayload } from "./commerceData.js";
import { isDeliveryEligibleOrder, isPendingCashOrder } from "./commercePolicy.js";
import { notifyDeliveryStatusChanged, notifyDriverAssigned, notifySupportTicketUpdated } from "./push.js";
import { supabase, supabaseNewApp } from "./supabase.js";

const ORDER_STATUSES = new Set([
  "pending",
  "accepted",
  "preparing",
  "picked_up",
  "on_the_way",
  "delivered",
  "cancelled",
]);
const SUPPORT_TICKET_STATUSES = new Set(["new", "open", "resolved", "closed"]);

function sendError(res, status, message) {
  return res.status(status).json({ status: "error", error: message, message });
}

function normalizeOrderStatus(value) {
  const normalized = typeof value === "string" ? value.trim().toLowerCase() : "";
  return ORDER_STATUSES.has(normalized) ? normalized : "";
}

function normalizeSupportTicketStatus(value) {
  const normalized = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (!normalized) return "open";
  if (normalized === "pending" || normalized === "in_review") return "open";
  return SUPPORT_TICKET_STATUSES.has(normalized) ? normalized : "open";
}

function latestPaymentByOrder(payments) {
  const byOrder = new Map();
  for (const row of payments || []) {
    if (!row?.related_order_id || byOrder.has(row.related_order_id)) continue;
    byOrder.set(row.related_order_id, row);
  }
  return byOrder;
}

export function registerAdminCommerceRoutes(app) {
  app.get("/api/admin/payments", async (req, res) => {
    try {
      await requireAdmin(req);
      const limit = Math.min(Math.max(Number(req.query.limit || 50), 1), 200);
      const status = typeof req.query.status === "string" ? req.query.status.trim() : "";

      let query = supabase
        .from("payments")
        .select("id,user_id,related_order_id,provider,method,reference,status,amount_mwk,currency,title,description,customer_email,created_at,paid_at,verified_at")
        .order("created_at", { ascending: false })
        .limit(limit);
      if (status) query = query.eq("status", status);

      const { data, error } = await query;
      if (error) throw new Error(error.message);
      return res.json({ status: "success", payments: data || [] });
    } catch (error) {
      return sendError(res, statusFromError(error, 403), error instanceof Error ? error.message : "Could not load payments.");
    }
  });

  app.get("/api/admin/orders", async (req, res) => {
    try {
      await requireAdmin(req);
      const limit = Math.min(Math.max(Number(req.query.limit || 50), 1), 200);
      const status = typeof req.query.status === "string" ? req.query.status.trim() : "";
      const deliveryStatus = typeof req.query.delivery_status === "string" ? req.query.delivery_status.trim() : "";

      let query = supabaseNewApp
        .from("orders")
        .select("id,customer_id,vendor_id,channel,status,delivery_mode,dropoff_notes,total_mwk,payment_status,created_at,updated_at")
        .order("created_at", { ascending: false })
        .limit(Math.min(limit * 3, 500));
      if (status) query = query.eq("status", status);

      const { data: orders, error } = await query;
      if (error) throw new Error(error.message);
      const orderRows = orders || [];
      if (!orderRows.length) return res.json({ status: "success", orders: [] });

      const orderIds = orderRows.map((row) => row.id);
      const vendorIds = [...new Set(orderRows.map((row) => row.vendor_id).filter(Boolean))];
      const [deliveriesRes, handoffsRes, vendorsRes, paymentsRes] = await Promise.all([
        supabaseNewApp.from("deliveries").select("order_id,driver_id,status,eta_minutes,updated_at").in("order_id", orderIds),
        supabaseNewApp.from("order_handoffs").select("order_id,order_reference,verified_at").in("order_id", orderIds),
        vendorIds.length
          ? supabaseNewApp.from("vendors").select("id,name,owner_id").in("id", vendorIds)
          : Promise.resolve({ data: [], error: null }),
        supabase
          .from("payments")
          .select("related_order_id,provider,status,created_at")
          .in("related_order_id", orderIds)
          .order("created_at", { ascending: false }),
      ]);
      if (deliveriesRes.error) throw new Error(deliveriesRes.error.message);
      if (handoffsRes.error) throw new Error(handoffsRes.error.message);
      if (vendorsRes.error) throw new Error(vendorsRes.error.message);
      if (paymentsRes.error) throw new Error(paymentsRes.error.message);

      const deliveriesByOrderId = new Map((deliveriesRes.data || []).map((row) => [row.order_id, row]));
      const handoffsByOrderId = new Map((handoffsRes.data || []).map((row) => [row.order_id, row]));
      const vendorsById = new Map((vendorsRes.data || []).map((row) => [row.id, row]));
      const paymentByOrderId = latestPaymentByOrder(paymentsRes.data);

      const rows = orderRows
        .filter((order) => isDeliveryEligibleOrder(order, paymentByOrderId.get(order.id)))
        .map((order) => ({
          ...order,
          vendor: vendorsById.get(order.vendor_id) || null,
          delivery: deliveriesByOrderId.get(order.id) || null,
          handoff: handoffsByOrderId.get(order.id) || null,
        }))
        .filter((row) => !deliveryStatus || row.delivery?.status === deliveryStatus)
        .slice(0, limit);

      return res.json({ status: "success", orders: rows });
    } catch (error) {
      return sendError(res, statusFromError(error, 403), error instanceof Error ? error.message : "Could not load orders.");
    }
  });

  app.get("/api/admin/orders/:orderId", async (req, res) => {
    try {
      await requireAdmin(req);
      const orderId = String(req.params.orderId || "").trim();
      if (!orderId) return sendError(res, 400, "Order id is required.");

      const detail = await getOrderDetailPayload(orderId);
      if (!detail) return sendError(res, 404, "Order not found.");
      return res.json({ status: "success", ...detail });
    } catch (error) {
      return sendError(res, statusFromError(error, 403), error instanceof Error ? error.message : "Could not load order.");
    }
  });

  app.post("/api/admin/orders/:orderId/status", async (req, res) => {
    try {
      await requireAdmin(req);
      const orderId = String(req.params.orderId || "").trim();
      const status = normalizeOrderStatus(req.body?.status);
      if (!orderId) return sendError(res, 400, "Order id is required.");
      if (!status) return sendError(res, 400, "Invalid order status.");

      const detail = await getOrderDetailPayload(orderId);
      if (!detail) return sendError(res, 404, "Order not found.");

      if (status === "delivered") {
        if (!detail.handoff?.verified_at) {
          return sendError(res, 409, "Verified handoff is required before an order can be marked delivered.");
        }
        if (isPendingCashOrder(detail.order, detail.payment)) {
          return sendError(res, 409, "Pending cash orders are completed only by verified handoff.");
        }
      }

      const { data, error } = await supabaseNewApp
        .from("orders")
        .update({ status, updated_at: new Date().toISOString() })
        .eq("id", orderId)
        .select("*")
        .single();
      if (error) throw new Error(error.message);

      return res.json({ status: "success", order: data });
    } catch (error) {
      return sendError(res, statusFromError(error, 403), error instanceof Error ? error.message : "Could not update order status.");
    }
  });

  app.post("/api/admin/orders/:orderId/assign-driver", async (req, res) => {
    try {
      await requireAdmin(req);
      const orderId = String(req.params.orderId || "").trim();
      const driverId = typeof req.body?.driver_id === "string" ? req.body.driver_id.trim() : "";
      const etaMinutes = Number(req.body?.eta_minutes);
      if (!orderId) return sendError(res, 400, "Order id is required.");
      if (!driverId) return sendError(res, 400, "driver_id is required.");

      const driver = await getProfileById(driverId);
      if (!driver || (driver.role !== "agent" && driver.role !== "admin")) {
        return sendError(res, 400, "Driver account not found or not eligible.");
      }

      const detail = await getOrderDetailPayload(orderId);
      if (!detail) return sendError(res, 404, "Order not found.");
      if (detail.handoff?.verified_at || String(detail.delivery?.status || "").toLowerCase() === "delivered") {
        return sendError(res, 409, "Completed deliveries cannot be reassigned.");
      }
      if (!isDeliveryEligibleOrder(detail.order, detail.payment)) {
        return sendError(res, 409, "Driver assignment requires confirmed payment or an authorized cash-on-delivery order.");
      }

      const payload = {
        driver_id: driverId,
        status: "assigned",
        eta_minutes: Number.isFinite(etaMinutes) ? etaMinutes : null,
        updated_at: new Date().toISOString(),
      };
      const { data, error } = await supabaseNewApp
        .from("deliveries")
        .upsert({ order_id: orderId, ...payload }, { onConflict: "order_id" })
        .select("*")
        .single();
      if (error) throw new Error(error.message);

      await notifyDriverAssigned(orderId, driverId);
      await notifyDeliveryStatusChanged(orderId, "assigned");
      return res.json({ status: "success", delivery: data });
    } catch (error) {
      return sendError(res, statusFromError(error, 403), error instanceof Error ? error.message : "Could not assign driver.");
    }
  });

  app.get("/api/admin/support-tickets", async (req, res) => {
    try {
      await requireAdmin(req);
      const limit = Math.min(Math.max(Number(req.query.limit || 50), 1), 200);
      const status = typeof req.query.status === "string" ? req.query.status.trim() : "";

      let query = supabase
        .from("support_tickets")
        .select("id,user_id,name,email,phone,type,listing_id,subject,message,status,admin_note,resolved_at,created_at")
        .order("created_at", { ascending: false })
        .limit(limit);
      if (status) query = query.eq("status", status);

      const { data, error } = await query;
      if (error) throw new Error(error.message);
      return res.json({ status: "success", tickets: data || [] });
    } catch (error) {
      return sendError(res, statusFromError(error, 403), error instanceof Error ? error.message : "Could not load support tickets.");
    }
  });

  app.post("/api/admin/support-tickets/:id/respond", async (req, res) => {
    try {
      const admin = await requireAdmin(req);
      const ticketId = String(req.params.id || "").trim();
      const status = normalizeSupportTicketStatus(req.body?.status);
      const adminNote = typeof req.body?.admin_note === "string" ? req.body.admin_note.trim() : "";
      if (!ticketId) return sendError(res, 400, "Ticket id is required.");

      const next = {
        admin_note: adminNote || null,
        status,
        resolved_at: status === "resolved" || status === "closed" ? new Date().toISOString() : null,
      };
      const { data, error } = await supabase
        .from("support_tickets")
        .update(next)
        .eq("id", ticketId)
        .select("*")
        .single();
      if (error) throw new Error(error.message);

      await notifySupportTicketUpdated(data);
      return res.json({
        status: "success",
        ticket: data,
        handled_by: { id: admin.id, role: admin.role },
      });
    } catch (error) {
      return sendError(res, statusFromError(error, 403), error instanceof Error ? error.message : "Could not update support ticket.");
    }
  });
}
