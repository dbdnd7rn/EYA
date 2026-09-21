import { config } from "./config.js";
import { supabase, supabaseNewApp } from "./supabase.js";

const EXPO_PUSH_ENDPOINT = "https://exp.host/--/api/v2/push/send";

function uniqueUserIds(userIds) {
  return [...new Set((userIds || []).filter((value) => typeof value === "string" && value.trim()))];
}

function uniqueTokens(rows) {
  return [
    ...new Set(
      (rows || [])
        .map((row) => row.push_token)
        .filter((value) => typeof value === "string" && (/^ExponentPushToken\[/.test(value) || /^ExpoPushToken\[/.test(value))),
    ),
  ];
}

function resolvePushPriority(input) {
  if (input.priority === "normal" || input.priority === "important") return input.priority;
  return input.playSound === false ? "normal" : "important";
}

async function createInAppNotifications(userIds, input) {
  const targets = uniqueUserIds(userIds);
  if (!targets.length) return;

  const rows = targets.map((userId) => ({
    user_id: userId,
    title: input.title,
    message: input.body,
    type: input.type || "system",
    priority: resolvePushPriority(input),
    data: input.data || {},
    is_read: false,
    pushed_at: new Date().toISOString(),
  }));

  const { error } = await supabase.from("notifications").insert(rows);
  if (error && !String(error.message || "").toLowerCase().includes("does not exist")) {
    console.error("[push-notifications-insert-error]", error.message);
  }
}

async function getPushTokensForUsers(userIds) {
  const targets = uniqueUserIds(userIds);
  if (!targets.length) return [];

  const { data, error } = await supabase
    .from("push_notification_tokens")
    .select("id,user_id,push_token,is_active")
    .in("user_id", targets)
    .eq("is_active", true);

  if (error) throw new Error(error.message);
  return data || [];
}

async function deactivateTokens(tokens) {
  if (!tokens.length) return;
  const { error } = await supabase.from("push_notification_tokens").update({ is_active: false }).in("push_token", tokens);
  if (error) {
    console.error("[push-notifications-deactivate-error]", error.message);
  }
}

export async function sendPushNotificationsToUsers(userIds, input) {
  const targets = uniqueUserIds(userIds);
  if (!targets.length) return { sent: 0 };

  if (!input.skipInApp) {
    await createInAppNotifications(targets, input);
  }

  const tokenRows = await getPushTokensForUsers(targets);
  const tokens = uniqueTokens(tokenRows);
  if (!tokens.length) return { sent: 0 };

  const messages = tokens.map((to) => ({
    to,
    title: input.title,
    body: input.body,
    data: {
      ...(input.data || {}),
      notificationType: input.type || "system",
      pushPriority: resolvePushPriority(input),
      playSound: input.playSound !== false,
    },
    sound: input.playSound === false ? undefined : "default",
    channelId: input.playSound === false ? "default" : "important",
  }));

  const headers = {
    Accept: "application/json",
    "Content-Type": "application/json",
  };

  if (config.expoPushAccessToken) {
    headers.Authorization = `Bearer ${config.expoPushAccessToken}`;
  }

  const response = await fetch(EXPO_PUSH_ENDPOINT, {
    method: "POST",
    headers,
    body: JSON.stringify(messages),
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(payload?.errors?.[0]?.message || payload?.message || "Expo push request failed.");
  }

  const invalidTokens = [];
  (payload?.data || []).forEach((ticket, index) => {
    if (ticket?.status === "error" && ticket?.details?.error === "DeviceNotRegistered") {
      invalidTokens.push(tokens[index]);
    }
  });

  await deactivateTokens(invalidTokens);
  return { sent: messages.length };
}

export async function notifyPaymentState(payment, status, extra = {}) {
  if (!payment?.user_id) return;

  const amountLabel = `MWK ${Math.round(Number(payment.amount_mwk || 0)).toLocaleString("en-MW")}`;
  if (status === "paid") {
    const title = payment.metadata?.purpose === "wallet_topup" ? "Wallet top-up successful" : "Payment successful";
    const body =
      payment.metadata?.purpose === "wallet_topup"
        ? `${amountLabel} was added to your wallet.`
        : `${amountLabel} payment was verified successfully.`;
    await sendPushNotificationsToUsers([payment.user_id], {
      title,
      body,
      type: "payment_success",
      data: {
        paymentId: payment.id,
        reference: payment.reference,
        relatedOrderId: payment.related_order_id || null,
        ...extra,
      },
    });
    return;
  }

  if (status === "failed" || status === "cancelled") {
    await sendPushNotificationsToUsers([payment.user_id], {
      title: "Payment not completed",
      body: `${amountLabel} payment ${status === "cancelled" ? "was cancelled" : "failed"}${payment.title ? ` for ${payment.title}` : ""}.`,
      type: "payment_failed",
      data: {
        paymentId: payment.id,
        reference: payment.reference,
        status,
        ...extra,
      },
      playSound: false,
    });
  }
}

export async function notifyCampusOrderCreated(orderId) {
  const { data: order, error: orderError } = await supabaseNewApp
    .from("orders")
    .select("id,customer_id,vendor_id,channel,total_mwk")
    .eq("id", orderId)
    .maybeSingle();
  if (orderError) throw new Error(orderError.message);
  if (!order) return;

  const { data: vendor, error: vendorError } = await supabaseNewApp
    .from("vendors")
    .select("id,owner_id,name")
    .eq("id", order.vendor_id)
    .maybeSingle();
  if (vendorError) throw new Error(vendorError.message);

  const amountLabel = `MWK ${Math.round(Number(order.total_mwk || 0)).toLocaleString("en-MW")}`;
  await sendPushNotificationsToUsers([order.customer_id], {
    title: "Order confirmed",
    body: `Your ${order.channel} order has been created and paid successfully.`,
    type: "order_created",
    data: { orderId, role: "customer" },
  });

  if (vendor?.owner_id) {
    await sendPushNotificationsToUsers([vendor.owner_id], {
      title: "New paid order",
      body: `${vendor.name || "Your shop"} received a new ${order.channel} order worth ${amountLabel}.`,
      type: "vendor_order_created",
      data: { orderId, role: "vendor" },
    });
  }
}

export async function notifyOrderDelivered(orderId) {
  const { data: order, error: orderError } = await supabaseNewApp
    .from("orders")
    .select("id,customer_id,vendor_id,channel")
    .eq("id", orderId)
    .maybeSingle();
  if (orderError) throw new Error(orderError.message);
  if (!order) return;

  const { data: vendor, error: vendorError } = await supabaseNewApp
    .from("vendors")
    .select("owner_id,name")
    .eq("id", order.vendor_id)
    .maybeSingle();
  if (vendorError) throw new Error(vendorError.message);

  const { data: handoff, error: handoffError } = await supabaseNewApp
    .from("order_handoffs")
    .select("order_reference,verification_method")
    .eq("order_id", orderId)
    .maybeSingle();
  if (handoffError) throw new Error(handoffError.message);

  const body = `Order ${handoff?.order_reference || orderId.slice(0, 8)} was completed${handoff?.verification_method ? ` via ${handoff.verification_method.toUpperCase()}` : ""}.`;
  const recipients = [order.customer_id, vendor?.owner_id].filter(Boolean);
  await sendPushNotificationsToUsers(recipients, {
    title: "Order completed",
    body,
    type: "order_completed",
    data: { orderId, role: "shared" },
  });
}

export async function notifyDriverAssigned(orderId, driverId) {
  if (!driverId) return;

  const { data: order, error: orderError } = await supabaseNewApp
    .from("orders")
    .select("id,channel,dropoff_notes,vendor_id")
    .eq("id", orderId)
    .maybeSingle();
  if (orderError) throw new Error(orderError.message);
  if (!order) return;

  const { data: vendor, error: vendorError } = await supabaseNewApp
    .from("vendors")
    .select("name")
    .eq("id", order.vendor_id)
    .maybeSingle();
  if (vendorError) throw new Error(vendorError.message);

  await sendPushNotificationsToUsers([driverId], {
    title: "New delivery assigned",
    body: `${vendor?.name || "Campus vendor"} assigned you a ${order.channel} delivery${order.dropoff_notes ? ` to ${order.dropoff_notes}` : ""}.`,
    type: "delivery_assigned",
    data: { orderId, role: "agent" },
  });
}

export async function notifyDeliveryStatusChanged(orderId, status) {
  const { data: order, error: orderError } = await supabaseNewApp
    .from("orders")
    .select("id,customer_id,vendor_id")
    .eq("id", orderId)
    .maybeSingle();
  if (orderError) throw new Error(orderError.message);
  if (!order) return;

  const { data: vendor, error: vendorError } = await supabaseNewApp
    .from("vendors")
    .select("owner_id,name")
    .eq("id", order.vendor_id)
    .maybeSingle();
  if (vendorError) throw new Error(vendorError.message);

  const titleMap = {
    assigned: "Rider assigned",
    picked_up: "Order picked up",
    arriving: "Rider arriving",
    delivered: "Delivery completed",
    failed: "Delivery issue",
    cancelled: "Delivery cancelled",
    searching: "Finding rider",
  };

  await sendPushNotificationsToUsers([order.customer_id, vendor?.owner_id].filter(Boolean), {
    title: titleMap[status] || "Delivery update",
    body: `${vendor?.name || "Order"} delivery is now ${String(status).replaceAll("_", " ")}.`,
    type: "delivery_status_changed",
    data: { orderId, status },
    playSound: status !== "searching",
  });
}

export async function notifySupportTicketUpdated(ticket) {
  if (!ticket?.user_id) return;

  const statusLabel = String(ticket.status || "open").replaceAll("_", " ");
  await sendPushNotificationsToUsers([ticket.user_id], {
    title: "Support ticket updated",
    body: ticket.admin_note
      ? `Your support ticket is now ${statusLabel}. ${ticket.admin_note}`
      : `Your support ticket is now ${statusLabel}.`,
    type: "support_ticket_updated",
    data: { ticketId: ticket.id, status: ticket.status || null },
  });
}
