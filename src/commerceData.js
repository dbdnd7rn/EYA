import { requireAuthenticatedActor } from "./auth.js";
import { isDeliveryEligibleOrder } from "./commercePolicy.js";
import { supabase, supabaseNewApp } from "./supabase.js";

export async function getDeliveryByOrderId(orderId) {
  const { data, error } = await supabaseNewApp
    .from("deliveries")
    .select("id,order_id,driver_id,status,eta_minutes,delivered_at,created_at,updated_at")
    .eq("order_id", orderId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

export async function getVendorById(vendorId) {
  const { data, error } = await supabaseNewApp
    .from("vendors")
    .select("id,owner_id,name,campus,area")
    .eq("id", vendorId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

export async function getOrderDetailPayload(orderId) {
  const { data: order, error: orderError } = await supabaseNewApp
    .from("orders")
    .select("id,customer_id,vendor_id,channel,status,delivery_mode,pickup_notes,dropoff_notes,subtotal_mwk,delivery_fee_mwk,service_fee_mwk,total_mwk,payment_status,created_at,updated_at")
    .eq("id", orderId)
    .maybeSingle();
  if (orderError) throw new Error(orderError.message);
  if (!order) return null;

  const [
    { data: items, error: itemError },
    delivery,
    { data: handoff, error: handoffError },
    { data: payment, error: paymentError },
    vendor,
    { data: customer, error: customerError },
  ] = await Promise.all([
    supabaseNewApp
      .from("order_items")
      .select("id,item_id,item_name_snapshot,quantity,unit_price_mwk,line_total_mwk,created_at")
      .eq("order_id", orderId)
      .order("created_at", { ascending: true }),
    getDeliveryByOrderId(orderId),
    supabaseNewApp
      .from("order_handoffs")
      .select("order_reference,verification_method,verified_at,verified_by")
      .eq("order_id", orderId)
      .maybeSingle(),
    supabase
      .from("payments")
      .select("id,reference,status,provider,method,purpose,amount_mwk,paid_at,verified_at,customer_email,customer_phone,title,description,currency,created_at")
      .eq("related_order_id", orderId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    getVendorById(order.vendor_id),
    supabase.from("profiles").select("id,full_name,phone").eq("id", order.customer_id).maybeSingle(),
  ]);

  if (itemError) throw new Error(itemError.message);
  if (handoffError) throw new Error(handoffError.message);
  if (paymentError) throw new Error(paymentError.message);
  if (customerError) throw new Error(customerError.message);

  return {
    order,
    items: items || [],
    delivery,
    handoff,
    payment,
    vendor,
    customer,
  };
}

export async function assertDeliveryActor(req, orderId) {
  const { actorId, profile } = await requireAuthenticatedActor(req);
  const detail = await getOrderDetailPayload(orderId);
  if (!detail) throw new Error("Order not found.");

  const isAdmin = profile?.role === "admin";
  const isAssignedDriver = detail.delivery?.driver_id === actorId;
  const isVendorOwner = detail.vendor?.owner_id === actorId;

  if (!isAdmin && !isAssignedDriver && !isVendorOwner) {
    const error = new Error("Not allowed to manage this delivery.");
    error.statusCode = 403;
    throw error;
  }

  return { actorId, profile, detail };
}

export function canSelfAssignDelivery(profile, detail, actorId, driverId) {
  return (
    profile?.role === "agent" &&
    actorId &&
    driverId &&
    actorId === driverId &&
    detail?.order &&
    isDeliveryEligibleOrder(detail.order, detail.payment) &&
    !detail.delivery?.driver_id &&
    String(detail.delivery?.status || "").toLowerCase() === "searching"
  );
}

export function canViewHandoff(detail, userId, role) {
  if (!detail?.order || !userId) return false;
  if (role === "admin") return true;
  if (detail.order.customer_id === userId) return true;
  if (detail.delivery?.driver_id === userId) return true;
  if (detail.vendor?.owner_id === userId) return true;
  return false;
}

export function canVerifyHandoff(detail, userId, role) {
  if (!detail?.order || !userId) return false;
  if (role === "admin") return true;
  if (detail.delivery?.driver_id === userId) return true;
  if (detail.vendor?.owner_id === userId) return true;
  return false;
}

function latestPaymentByOrder(payments) {
  const byOrder = new Map();
  for (const row of payments || []) {
    if (!row?.related_order_id || byOrder.has(row.related_order_id)) continue;
    byOrder.set(row.related_order_id, row);
  }
  return byOrder;
}

export async function listDeliveryRequestSummaries() {
  const { data: deliveries, error: deliveryError } = await supabaseNewApp
    .from("deliveries")
    .select("id,order_id,driver_id,status,eta_minutes,created_at,updated_at")
    .is("driver_id", null)
    .eq("status", "searching")
    .order("created_at", { ascending: true });
  if (deliveryError) throw new Error(deliveryError.message);

  const deliveryRows = deliveries || [];
  if (!deliveryRows.length) return [];

  const orderIds = deliveryRows.map((row) => row.order_id).filter(Boolean);
  const [{ data: orders, error: orderError }, { data: payments, error: paymentError }] = await Promise.all([
    supabaseNewApp
      .from("orders")
      .select("id,vendor_id,channel,status,delivery_mode,dropoff_notes,delivery_fee_mwk,total_mwk,payment_status,created_at,updated_at")
      .in("id", orderIds),
    supabase
      .from("payments")
      .select("related_order_id,provider,status,created_at")
      .in("related_order_id", orderIds)
      .order("created_at", { ascending: false }),
  ]);
  if (orderError) throw new Error(orderError.message);
  if (paymentError) throw new Error(paymentError.message);

  const paymentByOrderId = latestPaymentByOrder(payments);
  const orderRows = (orders || []).filter((order) =>
    isDeliveryEligibleOrder(order, paymentByOrderId.get(order.id)),
  );
  if (!orderRows.length) return [];

  const eligibleOrderIds = new Set(orderRows.map((row) => row.id));
  const vendorIds = [...new Set(orderRows.map((row) => row.vendor_id).filter(Boolean))];

  const [{ data: vendors, error: vendorError }, { data: items, error: itemError }] = await Promise.all([
    vendorIds.length
      ? supabaseNewApp.from("vendors").select("id,name,campus,area").in("id", vendorIds)
      : Promise.resolve({ data: [], error: null }),
    orderIds.length
      ? supabaseNewApp
          .from("order_items")
          .select("order_id,item_name_snapshot,quantity")
          .in("order_id", orderIds)
          .order("created_at", { ascending: true })
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (vendorError) throw new Error(vendorError.message);
  if (itemError) throw new Error(itemError.message);

  const vendorById = new Map((vendors || []).map((row) => [row.id, row]));
  const orderById = new Map(orderRows.map((row) => [row.id, row]));
  const itemsByOrderId = new Map();

  for (const row of items || []) {
    const current = itemsByOrderId.get(row.order_id) || [];
    current.push(row);
    itemsByOrderId.set(row.order_id, current);
  }

  return deliveryRows
    .filter((row) => eligibleOrderIds.has(row.order_id))
    .map((delivery) => {
      const order = orderById.get(delivery.order_id);
      const vendor = vendorById.get(order?.vendor_id);
      const lineItems = itemsByOrderId.get(delivery.order_id) || [];
      const title = lineItems[0]?.item_name_snapshot || vendor?.name || "Campus delivery";
      const itemSummary = lineItems.length
        ? lineItems.map((line) => `${line.quantity}x ${line.item_name_snapshot}`).join(", ")
        : "Order items unavailable";

      return {
        id: delivery.id,
        order_id: delivery.order_id,
        driver_id: delivery.driver_id,
        status: delivery.status,
        eta_minutes: delivery.eta_minutes,
        created_at: delivery.created_at,
        updated_at: delivery.updated_at,
        title,
        item_summary: itemSummary,
        vendor: vendor
          ? {
              id: vendor.id,
              name: vendor.name,
              campus: vendor.campus,
              area: vendor.area,
            }
          : null,
        order: order
          ? {
              id: order.id,
              channel: order.channel,
              status: order.status,
              delivery_mode: order.delivery_mode,
              dropoff_notes: order.dropoff_notes,
              delivery_fee_mwk: Number(order.delivery_fee_mwk || 0),
              total_mwk: Number(order.total_mwk || 0),
              payment_status: order.payment_status,
              created_at: order.created_at,
              updated_at: order.updated_at,
            }
          : null,
      };
    });
}
