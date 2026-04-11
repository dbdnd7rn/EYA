import { supabaseNewApp } from "../supabaseNewApp";
import { createInAppNotification } from "@/lib/appNotifications";
import type {
  CatalogItemRow,
  CreateOrderInput,
  DeliveryRow,
  OrderItemRow,
  OrderRow,
  OrderStatus,
  OrderWithItems,
} from "./types";

function throwIfError(error: { message: string } | null) {
  if (error) throw new Error(error.message);
}

async function getCatalogItemsByIds(itemIds: string[]): Promise<Map<string, CatalogItemRow>> {
  if (!itemIds.length) return new Map();
  const { data, error } = await supabaseNewApp
    .from("catalog_items")
    .select("id, vendor_id, channel, name, description, price_mwk, stock_qty, image_url, is_active, created_at, updated_at")
    .in("id", itemIds);
  throwIfError(error);
  const rows = (data ?? []) as CatalogItemRow[];
  return new Map(rows.map((row) => [row.id, row]));
}

export async function createOrderWithItems(input: CreateOrderInput): Promise<OrderWithItems> {
  if (!input.lines.length) throw new Error("Cannot create order without line items.");

  const uniqueItemIds = Array.from(new Set(input.lines.map((line) => line.item_id)));
  const catalogById = await getCatalogItemsByIds(uniqueItemIds);

  const invalidItem = input.lines.find((line) => !catalogById.has(line.item_id));
  if (invalidItem) throw new Error(`Item not found: ${invalidItem.item_id}`);

  const crossVendor = input.lines.some((line) => catalogById.get(line.item_id)?.vendor_id !== input.vendor_id);
  if (crossVendor) throw new Error("All line items must belong to the same vendor.");

  const crossChannel = input.lines.some((line) => catalogById.get(line.item_id)?.channel !== input.channel);
  if (crossChannel) throw new Error("All line items must match the order channel.");

  const subtotal = input.lines.reduce((sum, line) => {
    const item = catalogById.get(line.item_id)!;
    return sum + Number(item.price_mwk) * line.quantity;
  }, 0);

  const deliveryFee = input.delivery_fee_mwk ?? 0;
  const serviceFee = input.service_fee_mwk ?? Math.round(subtotal * 0.03);
  const total = subtotal + deliveryFee + serviceFee;

  const { data: orderData, error: orderError } = await supabaseNewApp
    .from("orders")
    .insert({
      customer_id: input.customer_id,
      vendor_id: input.vendor_id,
      channel: input.channel,
      delivery_mode: input.delivery_mode,
      pickup_notes: input.pickup_notes ?? null,
      dropoff_notes: input.dropoff_notes ?? null,
      pickup_latitude: input.pickup_latitude ?? null,
      pickup_longitude: input.pickup_longitude ?? null,
      dropoff_latitude: input.dropoff_latitude ?? null,
      dropoff_longitude: input.dropoff_longitude ?? null,
      subtotal_mwk: subtotal,
      delivery_fee_mwk: deliveryFee,
      service_fee_mwk: serviceFee,
      total_mwk: total,
      status: "pending",
    })
    .select("id, customer_id, vendor_id, channel, status, delivery_mode, pickup_notes, dropoff_notes, pickup_latitude, pickup_longitude, dropoff_latitude, dropoff_longitude, subtotal_mwk, delivery_fee_mwk, service_fee_mwk, total_mwk, payment_status, created_at, updated_at")
    .single();
  throwIfError(orderError);

  const order = orderData as OrderRow;

  const linePayload = input.lines.map((line) => {
    const item = catalogById.get(line.item_id)!;
    const unitPrice = Number(item.price_mwk);
    return {
      order_id: order.id,
      item_id: line.item_id,
      item_name_snapshot: item.name,
      quantity: line.quantity,
      unit_price_mwk: unitPrice,
      line_total_mwk: unitPrice * line.quantity,
    };
  });

  const { data: lineData, error: lineError } = await supabaseNewApp
    .from("order_items")
    .insert(linePayload)
    .select("id, order_id, item_id, item_name_snapshot, quantity, unit_price_mwk, line_total_mwk, created_at");
  throwIfError(lineError);
  const items = (lineData ?? []) as OrderItemRow[];

  let delivery: DeliveryRow | null = null;
  if (input.delivery_mode === "doorstep") {
    const { data: deliveryData, error: deliveryError } = await supabaseNewApp
      .from("deliveries")
      .insert({ order_id: order.id, status: "searching" })
      .select("id, order_id, driver_id, status, eta_minutes, current_latitude, current_longitude, proof_photo_url, delivered_at, created_at, updated_at")
      .single();
    throwIfError(deliveryError);
    delivery = deliveryData as DeliveryRow;
  }

  return { order, items, delivery };
}

export async function getOrderById(orderId: string): Promise<OrderRow | null> {
  const { data, error } = await supabaseNewApp
    .from("orders")
    .select("id, customer_id, vendor_id, channel, status, delivery_mode, pickup_notes, dropoff_notes, pickup_latitude, pickup_longitude, dropoff_latitude, dropoff_longitude, subtotal_mwk, delivery_fee_mwk, service_fee_mwk, total_mwk, payment_status, created_at, updated_at")
    .eq("id", orderId)
    .maybeSingle();
  throwIfError(error);
  return (data as OrderRow | null) ?? null;
}

export async function listOrdersForCustomer(customerId: string): Promise<OrderRow[]> {
  const { data, error } = await supabaseNewApp
    .from("orders")
    .select("id, customer_id, vendor_id, channel, status, delivery_mode, pickup_notes, dropoff_notes, pickup_latitude, pickup_longitude, dropoff_latitude, dropoff_longitude, subtotal_mwk, delivery_fee_mwk, service_fee_mwk, total_mwk, payment_status, created_at, updated_at")
    .eq("customer_id", customerId)
    .order("created_at", { ascending: false });
  throwIfError(error);
  return (data ?? []) as OrderRow[];
}

export async function listOrdersForVendorOwner(ownerId: string): Promise<OrderRow[]> {
  const { data: vendors, error: vendorError } = await supabaseNewApp.from("vendors").select("id").eq("owner_id", ownerId);
  throwIfError(vendorError);
  const vendorIds = (vendors ?? []).map((v) => (v as { id: string }).id);
  if (!vendorIds.length) return [];

  const { data, error } = await supabaseNewApp
    .from("orders")
    .select("id, customer_id, vendor_id, channel, status, delivery_mode, pickup_notes, dropoff_notes, pickup_latitude, pickup_longitude, dropoff_latitude, dropoff_longitude, subtotal_mwk, delivery_fee_mwk, service_fee_mwk, total_mwk, payment_status, created_at, updated_at")
    .in("vendor_id", vendorIds)
    .order("created_at", { ascending: false });
  throwIfError(error);
  return (data ?? []) as OrderRow[];
}

export async function updateOrderStatus(orderId: string, status: OrderStatus): Promise<OrderRow> {
  const { data, error } = await supabaseNewApp
    .from("orders")
    .update({ status })
    .eq("id", orderId)
    .select("id, customer_id, vendor_id, channel, status, delivery_mode, pickup_notes, dropoff_notes, pickup_latitude, pickup_longitude, dropoff_latitude, dropoff_longitude, subtotal_mwk, delivery_fee_mwk, service_fee_mwk, total_mwk, payment_status, created_at, updated_at")
    .single();
  throwIfError(error);
  const order = data as OrderRow;

  try {
    await createInAppNotification({
      userId: order.customer_id,
      title: "Order update",
      message: `Your order is now ${String(status).replaceAll("_", " ")}.`,
      type: "order_status_changed",
      priority: status === "cancelled" ? "important" : "normal",
      data: { orderId: order.id, status },
    });
  } catch {
    // Notification creation should not block seller order operations.
  }

  return order;
}

export async function getOrderItems(orderId: string): Promise<OrderItemRow[]> {
  const { data, error } = await supabaseNewApp
    .from("order_items")
    .select("id, order_id, item_id, item_name_snapshot, quantity, unit_price_mwk, line_total_mwk, created_at")
    .eq("order_id", orderId)
    .order("created_at", { ascending: true });
  throwIfError(error);
  return (data ?? []) as OrderItemRow[];
}

export async function getDeliveryByOrderId(orderId: string): Promise<DeliveryRow | null> {
  const { data, error } = await supabaseNewApp
    .from("deliveries")
    .select("id, order_id, driver_id, status, eta_minutes, current_latitude, current_longitude, proof_photo_url, delivered_at, created_at, updated_at")
    .eq("order_id", orderId)
    .maybeSingle();
  throwIfError(error);
  return (data as DeliveryRow | null) ?? null;
}
