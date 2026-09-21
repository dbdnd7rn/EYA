import QRCode from "qrcode";
import { requireAuthenticatedUser, statusFromError } from "./auth.js";
import { canVerifyHandoff, canViewHandoff, getOrderDetailPayload } from "./commerceData.js";
import { isDeliveryEligibleOrder } from "./commercePolicy.js";
import {
  createCampusMarketCashCheckout,
  getOrderHandoffByOrderId,
  getPaymentByRelatedOrderId,
  markHandoffVerified,
} from "./fulfillment.js";
import { supabase, supabaseNewApp } from "./supabase.js";

function sendError(res, status, message) {
  return res.status(status).json({ status: "error", error: message, message });
}

function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

export function registerCheckoutHandoffRoutes(app) {
  app.post("/api/checkout/cash", async (req, res) => {
    try {
      const { user } = await requireAuthenticatedUser(req);
      const purpose = typeof req.body?.purpose === "string" ? req.body.purpose.trim() : "";
      const orderDraft = asObject(req.body?.order);
      const title = typeof req.body?.title === "string" ? req.body.title.trim() : "Cash order payment";
      const description = typeof req.body?.description === "string" ? req.body.description.trim() : "Cash on delivery order";

      if (purpose !== "campus_market_order") {
        return sendError(res, 400, "Cash checkout currently supports campus market orders only.");
      }
      if (!orderDraft.vendor_id || !orderDraft.channel || !Array.isArray(orderDraft.lines) || !orderDraft.lines.length) {
        return sendError(res, 400, "Cash checkout is missing order details.");
      }

      const result = await createCampusMarketCashCheckout({
        userId: user.id,
        email: user.email || null,
        orderDraft,
        title,
        description,
      });

      return res.json({
        status: "success",
        payment_status: "pending",
        method: "cash",
        order_id: result.orderId,
        payment_id: result.payment.id,
        reference: result.payment.reference,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not complete cash checkout.";
      const status = /missing order details|invalid|not found|support/i.test(message)
        ? 400
        : statusFromError(error, 500);
      return sendError(res, status, message);
    }
  });

  app.get("/api/orders/:orderId/handoff", async (req, res) => {
    const orderId = String(req.params.orderId || "").trim();
    if (!orderId) return sendError(res, 400, "Order id is required.");

    try {
      const { user, profile } = await requireAuthenticatedUser(req);
      const detail = await getOrderDetailPayload(orderId);
      if (!detail) return sendError(res, 404, "Order not found.");
      if (!canViewHandoff(detail, user.id, profile?.role || null)) {
        return sendError(res, 403, "Not allowed to access this delivery pass.");
      }

      const payment = await getPaymentByRelatedOrderId(orderId);
      if (!payment) return sendError(res, 404, "Order payment not found.");
      if (!isDeliveryEligibleOrder(detail.order, payment)) {
        return sendError(res, 409, "This order is not eligible for delivery handoff.");
      }

      const metadata = asObject(payment.metadata);
      const handoffRow = await getOrderHandoffByOrderId(orderId);
      const handoff = handoffRow ? asObject(handoffRow) : asObject(metadata.handoff);
      const orderDraft = asObject(metadata.order);
      const order = detail.order;

      if (!handoff.delivery_pin || !handoff.qr_token) {
        return sendError(res, 409, "Delivery handoff security is not ready for this order.");
      }

      let rider = null;
      const driverId = detail.delivery?.driver_id || null;
      if (driverId) {
        const { data: riderProfile, error: riderError } = await supabase
          .from("profiles")
          .select("id,full_name,phone")
          .eq("id", driverId)
          .maybeSingle();
        if (riderError) throw new Error(riderError.message);
        if (riderProfile) {
          rider = {
            id: riderProfile.id,
            name: riderProfile.full_name || null,
            phone: riderProfile.phone || null,
          };
        }
      }

      const { data: items, error: itemError } = await supabaseNewApp
        .from("order_items")
        .select("item_name_snapshot,quantity,line_total_mwk")
        .eq("order_id", orderId)
        .order("created_at", { ascending: true });
      if (itemError) throw new Error(itemError.message);

      const qrPayload = JSON.stringify({
        order_id: orderId,
        order_reference: handoff.order_reference,
        qr_token: handoff.qr_token,
      });
      const qrDataUrl = await QRCode.toDataURL(qrPayload, { margin: 1, width: 280 });

      return res.json({
        status: "success",
        order_id: orderId,
        invoice: {
          order_reference: handoff.order_reference || null,
          title: payment.title,
          description: payment.description,
          amount_mwk: Number(payment.amount_mwk || 0),
          currency: payment.currency,
          customer_email: payment.customer_email,
          customer_phone: payment.customer_phone,
          delivery_address: order.dropoff_notes,
          delivery_mode: order.delivery_mode,
          created_at: order.created_at,
          payment_reference: payment.reference,
          line_items: items || [],
        },
        handoff: {
          delivery_pin: handoff.delivery_pin || null,
          qr_token: handoff.qr_token || null,
          qr_data_url: qrDataUrl,
          verified_at: handoff.verified_at || null,
        },
        order: {
          id: order.id,
          status: order.status,
          channel: order.channel,
          delivery_mode: order.delivery_mode,
          total_mwk: Number(order.total_mwk || payment.amount_mwk || 0),
          subtotal_mwk: Number(order.subtotal_mwk || 0),
          delivery_fee_mwk: Number(order.delivery_fee_mwk || orderDraft.delivery_fee_mwk || 0),
          service_fee_mwk: Number(order.service_fee_mwk || orderDraft.service_fee_mwk || 0),
        },
        rider,
      });
    } catch (error) {
      return sendError(res, statusFromError(error, 500), error instanceof Error ? error.message : "Could not load handoff details.");
    }
  });

  app.post("/api/orders/:orderId/handoff/verify", async (req, res) => {
    const orderId = String(req.params.orderId || "").trim();
    if (!orderId) return sendError(res, 400, "Order id is required.");

    const pin = typeof req.body?.pin === "string" ? req.body.pin : null;
    const qrToken = typeof req.body?.qr_token === "string" ? req.body.qr_token : null;
    if (!pin && !qrToken) return sendError(res, 400, "Provide a delivery pin or qr_token.");

    try {
      const { user, profile } = await requireAuthenticatedUser(req);
      const detail = await getOrderDetailPayload(orderId);
      if (!detail) return sendError(res, 404, "Order not found.");
      if (!canVerifyHandoff(detail, user.id, profile?.role || null)) {
        return sendError(res, 403, "Not allowed to verify this delivery handoff.");
      }

      const payment = await markHandoffVerified(orderId, user.id, { pin, qr_token: qrToken });
      return res.json({
        status: "success",
        message: "Handoff verified.",
        order_id: orderId,
        payment_id: payment.id,
        verified_at: asObject(payment.metadata).handoff?.verified_at || null,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not verify delivery handoff.";
      const status = /invalid delivery verification|provide|arriving|not eligible/i.test(message)
        ? 400
        : statusFromError(error, 400);
      return sendError(res, status, message);
    }
  });
}
