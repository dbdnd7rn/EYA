export const DELIVERY_STATUSES = new Set([
  "searching",
  "assigned",
  "picked_up",
  "arriving",
  "delivered",
  "failed",
  "cancelled",
]);

function normalized(value) {
  return String(value || "").trim().toLowerCase();
}

export function isPaidOrder(order, payment) {
  return normalized(order?.payment_status) === "paid" && normalized(payment?.status) === "paid";
}

export function isPendingCashOrder(order, payment) {
  return (
    normalized(order?.payment_status) === "pending" &&
    normalized(payment?.status) === "pending" &&
    normalized(payment?.provider) === "cash"
  );
}

export function isDeliveryEligibleOrder(order, payment) {
  return isPaidOrder(order, payment) || isPendingCashOrder(order, payment);
}

export function assertDeliveryStatusTransition({ order, payment, nextStatus, handoffVerified = false }) {
  const status = normalized(nextStatus);
  if (!DELIVERY_STATUSES.has(status)) {
    throw new Error("Invalid delivery status.");
  }

  if (!isDeliveryEligibleOrder(order, payment)) {
    throw new Error("Order payment is not eligible for delivery.");
  }

  if (status === "delivered" && !handoffVerified) {
    throw new Error("Verified handoff is required before delivery can be completed.");
  }

  if (status === "delivered" && isPendingCashOrder(order, payment)) {
    throw new Error("Pending cash payment must be completed by verified handoff.");
  }

  return status;
}
