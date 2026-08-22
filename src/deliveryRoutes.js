import { getProfileById, requireAuthenticatedActor, statusFromError } from "./auth.js";
import {
  assertDeliveryActor,
  canSelfAssignDelivery,
  getOrderDetailPayload,
  listDeliveryRequestSummaries,
} from "./commerceData.js";
import { assertDeliveryStatusTransition, isDeliveryEligibleOrder } from "./commercePolicy.js";
import { notifyDeliveryStatusChanged, notifyDriverAssigned } from "./push.js";
import { supabaseNewApp } from "./supabase.js";

function sendError(res, status, message) {
  return res.status(status).json({ status: "error", error: message, message });
}

export function registerDeliveryRoutes(app) {
  app.get("/api/deliveries/unassigned", async (req, res) => {
    try {
      const { profile } = await requireAuthenticatedActor(req);
      if (!profile || (profile.role !== "admin" && profile.role !== "agent")) {
        return sendError(res, 403, "Dispatch access required.");
      }

      const deliveries = await listDeliveryRequestSummaries();
      return res.json({ status: "success", deliveries });
    } catch (error) {
      return sendError(res, statusFromError(error, 403), error instanceof Error ? error.message : "Could not load unassigned deliveries.");
    }
  });

  app.post("/api/deliveries/:orderId/assign", async (req, res) => {
    try {
      const orderId = String(req.params.orderId || "").trim();
      const { actorId, profile } = await requireAuthenticatedActor(req);
      const requestedDriverId = typeof req.body?.driver_id === "string" ? req.body.driver_id.trim() : "";
      const driverId = requestedDriverId || actorId || "";
      if (!orderId) return sendError(res, 400, "Order id is required.");
      if (!driverId) return sendError(res, 400, "driver_id is required.");

      const detail = await getOrderDetailPayload(orderId);
      if (!detail) return sendError(res, 404, "Order not found.");
      if (detail.handoff?.verified_at || String(detail.delivery?.status || "").toLowerCase() === "delivered") {
        return sendError(res, 409, "Completed deliveries cannot be reassigned.");
      }

      const driver = await getProfileById(driverId);
      if (!driver || (driver.role !== "agent" && driver.role !== "admin")) {
        return sendError(res, 400, "Driver account not found or not eligible.");
      }
      if (!isDeliveryEligibleOrder(detail.order, detail.payment)) {
        return sendError(res, 409, "Driver assignment requires confirmed payment or an authorized cash-on-delivery order.");
      }

      const isAdmin = profile?.role === "admin";
      const isVendorOwner = detail.vendor?.owner_id === actorId;
      const selfAssigningAgent = canSelfAssignDelivery(profile, detail, actorId, driverId);
      if (!isAdmin && !isVendorOwner && !selfAssigningAgent) {
        return sendError(res, 403, "Not allowed to assign this delivery.");
      }

      let assignedDelivery = null;
      if (selfAssigningAgent) {
        const { data, error } = await supabaseNewApp
          .from("deliveries")
          .update({
            driver_id: driverId,
            status: "assigned",
            updated_at: new Date().toISOString(),
          })
          .eq("order_id", orderId)
          .is("driver_id", null)
          .eq("status", "searching")
          .select("*");
        if (error) throw new Error(error.message);
        assignedDelivery = Array.isArray(data) ? data[0] : data;
      } else {
        const { data, error } = await supabaseNewApp
          .from("deliveries")
          .upsert(
            {
              order_id: orderId,
              driver_id: driverId,
              status: "assigned",
              updated_at: new Date().toISOString(),
            },
            { onConflict: "order_id" },
          )
          .select("*")
          .single();
        if (error) throw new Error(error.message);
        assignedDelivery = data;
      }

      if (!assignedDelivery?.id) {
        return sendError(res, 409, "This delivery was already claimed by another rider.");
      }

      await notifyDriverAssigned(orderId, driverId);
      await notifyDeliveryStatusChanged(orderId, "assigned");
      return res.json({
        status: "success",
        delivery: assignedDelivery,
        actor_id: actorId,
        actor_role: profile?.role,
        vendor_id: detail.order.vendor_id,
      });
    } catch (error) {
      return sendError(res, statusFromError(error, 403), error instanceof Error ? error.message : "Could not assign delivery.");
    }
  });

  app.post("/api/deliveries/:orderId/unassign", async (req, res) => {
    try {
      const orderId = String(req.params.orderId || "").trim();
      if (!orderId) return sendError(res, 400, "Order id is required.");

      const { detail } = await assertDeliveryActor(req, orderId);
      if (detail.handoff?.verified_at || String(detail.delivery?.status || "").toLowerCase() === "delivered") {
        return sendError(res, 409, "Completed deliveries cannot be unassigned.");
      }

      const { data, error } = await supabaseNewApp
        .from("deliveries")
        .update({
          driver_id: null,
          status: "searching",
          eta_minutes: null,
          updated_at: new Date().toISOString(),
        })
        .eq("order_id", orderId)
        .select("*")
        .single();
      if (error) throw new Error(error.message);

      await notifyDeliveryStatusChanged(orderId, "searching");
      return res.json({ status: "success", delivery: data });
    } catch (error) {
      return sendError(res, statusFromError(error, 403), error instanceof Error ? error.message : "Could not unassign delivery.");
    }
  });

  app.post("/api/deliveries/:orderId/status", async (req, res) => {
    try {
      const orderId = String(req.params.orderId || "").trim();
      const requestedStatus = typeof req.body?.status === "string" ? req.body.status.trim() : "";
      if (!orderId) return sendError(res, 400, "Order id is required.");

      const { actorId, detail } = await assertDeliveryActor(req, orderId);
      const status = assertDeliveryStatusTransition({
        order: detail.order,
        payment: detail.payment,
        nextStatus: requestedStatus,
        handoffVerified: Boolean(detail.handoff?.verified_at),
      });

      const deliveryPatch = {
        status,
        updated_at: new Date().toISOString(),
        ...(status === "delivered" ? { delivered_at: new Date().toISOString() } : {}),
      };
      const { data, error } = await supabaseNewApp
        .from("deliveries")
        .update(deliveryPatch)
        .eq("order_id", orderId)
        .select("*")
        .single();
      if (error) throw new Error(error.message);

      const orderPatch = {
        updated_at: new Date().toISOString(),
        ...(status === "delivered"
          ? { status: "delivered" }
          : status === "picked_up"
            ? { status: "picked_up" }
            : status === "arriving"
              ? { status: "on_the_way" }
              : status === "cancelled"
                ? { status: "cancelled" }
                : {}),
      };
      const { error: orderError } = await supabaseNewApp.from("orders").update(orderPatch).eq("id", orderId);
      if (orderError) throw new Error(orderError.message);

      await notifyDeliveryStatusChanged(orderId, status);
      return res.json({ status: "success", delivery: data, actor_id: actorId });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not update delivery status.";
      const status = /invalid delivery status/i.test(message) ? 400 : /payment|handoff|eligible/i.test(message) ? 409 : statusFromError(error, 403);
      return sendError(res, status, message);
    }
  });
}
