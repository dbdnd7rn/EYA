import { supabase, supabaseNewApp } from "./supabase.js";
import { notifyCampusOrderCreated, notifyOrderDelivered, notifyPaymentState } from "./push.js";
import { buildFoodOrderSnapshot } from "./foodMenu.js";

function throwIfError(error) {
  if (error) throw new Error(error.message || "Database operation failed.");
}

function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function isUuid(value) {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value.trim());
}

function normalizePurpose(metadata) {
  if (typeof metadata?.purpose === "string" && metadata.purpose.trim()) return metadata.purpose.trim();
  return "generic_checkout";
}

function randomDigits(length) {
  let output = "";
  for (let i = 0; i < length; i += 1) {
    output += Math.floor(Math.random() * 10);
  }
  return output;
}

function buildOrderReference(orderId) {
  return `PMK-${String(orderId).replace(/-/g, "").slice(0, 8).toUpperCase()}`;
}

function mergeMetadata(payment, patch) {
  return {
    ...asObject(payment.metadata),
    ...patch,
  };
}

function paymentStatusFromVerifyPayload(payload) {
  const explicitPaidFlags = [
    payload?.paid,
    payload?.is_paid,
    payload?.data?.paid,
    payload?.data?.is_paid,
    payload?.data?.data?.paid,
    payload?.data?.data?.is_paid,
  ];
  if (explicitPaidFlags.some((value) => value === true)) return "paid";

  const explicitPaymentStatus = [
    payload?.status,
    payload?.payment_status,
    payload?.data?.status,
    payload?.data?.payment_status,
    payload?.data?.transaction?.status,
    payload?.data?.data?.payment_status,
  ].find((value) => typeof value === "string" && value.trim());

  const transactionStatus = [
    payload?.transaction?.status,
    payload?.data?.transaction?.status,
    payload?.data?.data?.status,
    payload?.transaction?.authorization?.status,
    payload?.data?.transaction?.authorization?.status,
    payload?.data?.authorization?.status,
    payload?.data?.data?.authorization?.status,
  ].find((value) => typeof value === "string" && value.trim());

  const normalized = String(explicitPaymentStatus || transactionStatus || "").toLowerCase();
  if (["paid", "successful", "completed", "successfully_completed"].includes(normalized)) return "paid";
  if (normalized.includes("fail") || normalized === "failed") return "failed";
  if (normalized.includes("cancel")) return "cancelled";
  return "pending";
}

function extractPaidAt(payload) {
  return (
    payload?.data?.transaction?.authorization?.completed_at ||
    payload?.transaction?.authorization?.completed_at ||
    payload?.data?.transaction?.completed_at ||
    payload?.data?.authorization?.completed_at ||
    payload?.data?.data?.completed_at ||
    payload?.data?.completed_at ||
    payload?.completed_at ||
    payload?.data?.updated_at ||
    payload?.updated_at ||
    null
  );
}

function extractExternalReference(payload) {
  return (
    payload?.data?.transaction?.ref_id ||
    payload?.data?.ref_id ||
    payload?.data?.reference ||
    payload?.data?.data?.reference ||
    payload?.transaction?.ref_id ||
    payload?.reference ||
    payload?.ref_id ||
    payload?.charge_id ||
    null
  );
}

async function resolveProfileUserId(candidateUserId, email) {
  if (isUuid(candidateUserId)) return candidateUserId.trim();

  if (typeof email === "string" && email.trim()) {
    const normalizedEmail = email.trim().toLowerCase();
    const { data, error } = await supabase.from("profiles").select("id").eq("email", normalizedEmail).maybeSingle();
    throwIfError(error);
    if (data?.id && isUuid(data.id)) return data.id;
  }

  return null;
}

export async function recordPaymentInitiation({ input, checkoutUrl, providerPayload, txRef }) {
  const metadata = asObject(input.meta);
  const userId = await resolveProfileUserId(typeof metadata.user_id === "string" ? metadata.user_id : null, input.email);
  const merchantTxRef = typeof input.tx_ref === "string" && input.tx_ref.trim() ? input.tx_ref.trim() : txRef;
  const purpose = typeof metadata.purpose === "string" && metadata.purpose.trim() ? metadata.purpose.trim() : "generic_checkout";
  const payload = {
    user_id: userId,
    purpose,
    related_order_id: typeof metadata.related_order_id === "string" ? metadata.related_order_id : null,
    project: input.project || "eya",
    provider: "paychangu",
    method: typeof metadata.payment_method === "string" ? metadata.payment_method : "mpamba",
    reference: txRef,
    tx_ref: merchantTxRef,
    currency: input.currency || "MWK",
    amount_mwk: Number(input.amount),
    title: input.title || null,
    description: input.description || "Checkout payment",
    customer_email: input.email || null,
    customer_phone: typeof metadata.msisdn === "string" ? metadata.msisdn : null,
    customer_first_name: input.first_name || null,
    customer_last_name: input.last_name || null,
    checkout_url: checkoutUrl,
    status: "pending",
    metadata: {
      ...metadata,
      merchant_tx_ref: merchantTxRef,
      provider_reference: txRef,
    },
    provider_payload: providerPayload,
  };

  const { data, error } = await supabase
    .from("payments")
    .upsert(payload, { onConflict: "reference" })
    .select("*")
    .single();
  throwIfError(error);

  await appendPaymentEvent(data.id, "checkout_initiated", "pending", providerPayload);
  return data;
}

export async function findPaymentByReference(reference) {
  const { data, error } = await supabase.from("payments").select("*").eq("reference", reference).maybeSingle();
  throwIfError(error);
  return data;
}

export async function findPaymentByAnyReference(reference) {
  const normalized = typeof reference === "string" ? reference.trim() : "";
  if (!normalized) return null;

  const direct = await findPaymentByReference(normalized);
  if (direct) return direct;

  const { data, error } = await supabase
    .from("payments")
    .select("*")
    .or(
      [
        `tx_ref.eq.${normalized}`,
        `external_reference.eq.${normalized}`,
        `metadata->>merchant_tx_ref.eq.${normalized}`,
        `metadata->>provider_reference.eq.${normalized}`,
      ].join(","),
    )
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  throwIfError(error);
  return data;
}

export async function appendPaymentEvent(paymentId, eventType, status, payload) {
  const { error } = await supabase.from("payment_events").insert({
    payment_id: paymentId,
    event_type: eventType,
    status: status || null,
    payload: payload || {},
  });
  throwIfError(error);
}

async function getWalletAccount(userId) {
  const { data, error } = await supabase
    .from("wallet_accounts")
    .select("user_id,balance_mwk,points")
    .eq("user_id", userId)
    .maybeSingle();
  throwIfError(error);
  return data;
}

async function getOrCreateWalletAccount(userId) {
  const existing = await getWalletAccount(userId);
  if (existing) return existing;

  const { data, error } = await supabase
    .from("wallet_accounts")
    .upsert(
      {
        user_id: userId,
        balance_mwk: 0,
        points: 0,
      },
      { onConflict: "user_id" },
    )
    .select("user_id,balance_mwk,points")
    .single();
  throwIfError(error);
  return data;
}

async function calculateWalletBalanceFromActivities(userId) {
  const { data, error } = await supabase
    .from("wallet_activities")
    .select("amount_mwk")
    .eq("user_id", userId);
  throwIfError(error);
  return (data || []).reduce((sum, row) => sum + Number(row.amount_mwk || 0), 0);
}

async function syncWalletAccountFromActivities(userId) {
  const account = await getOrCreateWalletAccount(userId);
  const nextBalance = await calculateWalletBalanceFromActivities(userId);

  const { data, error } = await supabase
    .from("wallet_accounts")
    .upsert(
      {
        user_id: userId,
        balance_mwk: nextBalance,
        points: Number(account?.points || 0),
      },
      { onConflict: "user_id" },
    )
    .select("user_id,balance_mwk,points")
    .single();
  throwIfError(error);
  return data;
}

async function debitWalletAccount({ userId, amountMwk, label, meta = {} }) {
  await getOrCreateWalletAccount(userId);
  const currentBalance = await calculateWalletBalanceFromActivities(userId);
  if (currentBalance < amountMwk) {
    throw new Error("Insufficient wallet balance.");
  }

  const { data: activity, error: activityError } = await supabase
    .from("wallet_activities")
    .insert({
      user_id: userId,
      label,
      amount_mwk: -amountMwk,
      type: "payment",
      meta,
    })
    .select("id,label,amount_mwk,type,meta,created_at")
    .single();
  throwIfError(activityError);

  const nextAccount = await syncWalletAccountFromActivities(userId);
  return { account: nextAccount, activity };
}

async function creditWalletFromPayment(payment) {
  const userId = await resolveProfileUserId(payment.user_id, payment.customer_email);
  if (!userId) throw new Error("Wallet top-up payment is missing a valid user_id.");

  const { data: existingActivity, error: existingActivityError } = await supabase
    .from("wallet_activities")
    .select("id")
    .eq("user_id", userId)
    .eq("type", "topup")
    .eq("meta->>payment_reference", String(payment.reference))
    .limit(1)
    .maybeSingle();
  throwIfError(existingActivityError);
  if (existingActivity?.id) return;

  await getOrCreateWalletAccount(userId);

  const label = typeof payment.method === "string" ? payment.method.replace(/_/g, " ") : "PayChangu";
  const { error: activityError } = await supabase.from("wallet_activities").insert({
    user_id: userId,
    label: `Wallet top-up - ${label}`,
    amount_mwk: Number(payment.amount_mwk || 0),
    type: "topup",
    meta: {
      payment_reference: payment.reference,
      provider: payment.provider,
      payment_source: "paychangu",
      payment_method: payment.method || null,
      payment_method_label: label,
    },
  });
  throwIfError(activityError);
  await syncWalletAccountFromActivities(userId);
}

async function walletTopupAlreadyCredited(payment) {
  const userId = await resolveProfileUserId(payment.user_id, payment.customer_email);
  if (!userId) return false;

  const { data, error } = await supabase
    .from("wallet_activities")
    .select("id")
    .eq("user_id", userId)
    .eq("type", "topup")
    .eq("meta->>payment_reference", String(payment.reference))
    .limit(1)
    .maybeSingle();
  throwIfError(error);
  return !!data?.id;
}

async function getCatalogItemsByIds(itemIds) {
  const { data, error } = await supabaseNewApp
    .from("catalog_items")
    .select("id, vendor_id, channel, name, description, price_mwk, is_active")
    .in("id", itemIds);
  throwIfError(error);
  return new Map((data || []).map((row) => [row.id, row]));
}

async function prepareCampusMarketOrderDraft({ customerId, orderDraft }) {
  const lines = Array.isArray(orderDraft?.lines) ? orderDraft.lines : [];
  if (!customerId) throw new Error("Order payment is missing a valid customer profile.");
  if (!orderDraft?.vendor_id || !orderDraft?.channel || !lines.length) {
    throw new Error("Payment metadata is missing campus market order details.");
  }

  const uniqueIds = [...new Set(lines.map((line) => line.item_id).filter(Boolean))];
  const catalogById = await getCatalogItemsByIds(uniqueIds);

  const subtotal = lines.reduce((sum, line) => {
    const item = catalogById.get(line.item_id);
    if (!item) throw new Error(`Catalog item not found: ${line.item_id}`);
    if (item.vendor_id !== orderDraft.vendor_id) throw new Error("All line items must belong to the same vendor.");
    if (item.channel !== orderDraft.channel) throw new Error("Line items do not match the declared order channel.");
    const foodSnapshot =
      orderDraft.channel === "food"
        ? buildFoodOrderSnapshot(item.name, item.price_mwk, item.description, line.food_customization)
        : { unitPrice: Number(item.price_mwk) };
    return sum + Number(foodSnapshot.unitPrice) * Number(line.quantity || 0);
  }, 0);

  const deliveryFee = Number(orderDraft.delivery_fee_mwk || 0);
  const serviceFee = Number(orderDraft.service_fee_mwk || Math.round(subtotal * 0.03));
  const total = subtotal + deliveryFee + serviceFee;

  const orderPayload = {
    customer_id: customerId,
    vendor_id: orderDraft.vendor_id,
    channel: orderDraft.channel,
    status: "pending",
    delivery_mode: orderDraft.delivery_mode || "pickup",
    pickup_notes: orderDraft.pickup_notes || null,
    dropoff_notes: orderDraft.dropoff_notes || null,
    pickup_latitude: orderDraft.pickup_latitude ?? null,
    pickup_longitude: orderDraft.pickup_longitude ?? null,
    dropoff_latitude: orderDraft.dropoff_latitude ?? null,
    dropoff_longitude: orderDraft.dropoff_longitude ?? null,
    subtotal_mwk: subtotal,
    delivery_fee_mwk: deliveryFee,
    service_fee_mwk: serviceFee,
    total_mwk: total,
    payment_status: "paid",
  };

  const orderItems = lines.map((line) => {
    const item = catalogById.get(line.item_id);
    const quantity = Number(line.quantity || 0);
    const foodSnapshot =
      orderDraft.channel === "food"
        ? buildFoodOrderSnapshot(item.name, item.price_mwk, item.description, line.food_customization)
        : { itemNameSnapshot: item.name, unitPrice: Number(item.price_mwk) };
    return {
      item_id: line.item_id,
      item_name_snapshot: foodSnapshot.itemNameSnapshot,
      quantity,
      unit_price_mwk: foodSnapshot.unitPrice,
      line_total_mwk: foodSnapshot.unitPrice * quantity,
    };
  });

  return {
    orderPayload,
    orderItems,
    total,
  };
}

async function insertCampusMarketOrder(prepared) {
  const { orderPayload, orderItems } = prepared;

  const { data: orderData, error: orderError } = await supabaseNewApp
    .from("orders")
    .insert(orderPayload)
    .select("id")
    .single();
  throwIfError(orderError);

  const orderId = orderData.id;

  const { error: itemError } = await supabaseNewApp.from("order_items").insert(
    orderItems.map((row) => ({
      ...row,
      order_id: orderId,
    })),
  );
  throwIfError(itemError);

  if (orderPayload.delivery_mode === "doorstep") {
    const { error: deliveryError } = await supabaseNewApp.from("deliveries").insert({
      order_id: orderId,
      status: "searching",
    });
    throwIfError(deliveryError);
  }

  return orderId;
}

async function createCampusMarketWalletCheckoutFallback({ userId, email, orderDraft, title, description }) {
  const customerId = await resolveProfileUserId(userId, email);
  if (!customerId) throw new Error("Wallet checkout is missing a valid customer profile.");

  const prepared = await prepareCampusMarketOrderDraft({ customerId, orderDraft });
  const debit = await debitWalletAccount({
    userId: customerId,
    amountMwk: Math.round(prepared.total),
    label: `Wallet purchase - ${title || `${orderDraft.channel} order`}`,
    meta: {
      kind: "wallet_checkout",
      channel: orderDraft.channel,
      vendor_id: orderDraft.vendor_id,
      delivery_mode: orderDraft.delivery_mode || "pickup",
      payment_source: "wallet",
      payment_method: "wallet",
      payment_method_label: "Wallet",
    },
  });

  const orderId = await insertCampusMarketOrder(prepared);
  const handoff = createHandoffSecurity(orderId);
  const paymentReference = `wallet_${orderId}`;

  const { data: payment, error: paymentError } = await supabase
    .from("payments")
    .insert({
      user_id: customerId,
      purpose: "wallet_order_payment",
      related_order_id: orderId,
      project: "eya",
      provider: "wallet",
      method: null,
      reference: paymentReference,
      tx_ref: paymentReference,
      currency: "MWK",
      amount_mwk: Math.round(prepared.total),
      title: title || "Wallet order payment",
      description: description || "Wallet payment",
      customer_email: email || null,
      status: "paid",
      metadata: {
        purpose: "campus_market_order",
        payment_source: "wallet",
        wallet_activity_id: debit.activity.id,
        order: orderDraft,
        handoff,
      },
      provider_payload: {
        source: "wallet",
        wallet_activity_id: debit.activity.id,
      },
      verified_at: new Date().toISOString(),
      paid_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  throwIfError(paymentError);

  await appendPaymentEvent(payment.id, "wallet_checkout", "paid", {
    order_id: orderId,
    wallet_activity_id: debit.activity.id,
  });

  await upsertOrderHandoff({
    orderId,
    paymentId: payment.id,
    handoff,
  });

  return {
    orderId,
    payment: { id: payment.id },
    wallet: { balance_mwk: Number(debit.account.balance_mwk || 0) },
    activity: { id: debit.activity.id },
  };
}

async function createCampusMarketOrderFromPayment(payment) {
  const metadata = asObject(payment.metadata);
  const orderDraft = asObject(metadata.order);
  const customerId = await resolveProfileUserId(payment.user_id, payment.customer_email);
  const prepared = await prepareCampusMarketOrderDraft({ customerId, orderDraft });
  return insertCampusMarketOrder(prepared);
}

function createHandoffSecurity(orderId) {
  return {
    order_reference: buildOrderReference(orderId),
    delivery_pin: randomDigits(6),
    qr_token: `${orderId}:${Date.now()}:${randomDigits(8)}`,
    issued_at: new Date().toISOString(),
    verified_at: null,
    verified_by: null,
  };
}

async function upsertOrderHandoff({ orderId, paymentId, handoff }) {
  const { data, error } = await supabaseNewApp
    .from("order_handoffs")
    .upsert(
      {
        order_id: orderId,
        payment_id: paymentId || null,
        order_reference: handoff.order_reference,
        delivery_pin: handoff.delivery_pin,
        qr_token: handoff.qr_token,
        verification_method: handoff.verification_method || null,
        verified_at: handoff.verified_at || null,
        verified_by: handoff.verified_by || null,
      },
      { onConflict: "order_id" },
    )
    .select("*")
    .single();
  throwIfError(error);
  return data;
}

export async function getOrderHandoffByOrderId(orderId) {
  const { data, error } = await supabaseNewApp.from("order_handoffs").select("*").eq("order_id", orderId).maybeSingle();
  throwIfError(error);
  return data;
}

async function finalizePayment(payment, verifyPayload) {
  const normalizedStatus = paymentStatusFromVerifyPayload(verifyPayload);
  const paidAt = extractPaidAt(verifyPayload);
  const externalReference = extractExternalReference(verifyPayload);
  const purpose = normalizePurpose(payment.metadata);

  if (normalizedStatus !== "paid") {
    const shouldNotify = payment.status !== normalizedStatus && (normalizedStatus === "failed" || normalizedStatus === "cancelled");
    const { data, error } = await supabase
      .from("payments")
      .update({
        status: normalizedStatus,
        provider_payload: verifyPayload,
        external_reference: externalReference,
      })
      .eq("id", payment.id)
      .select("*")
      .single();
    throwIfError(error);
    await appendPaymentEvent(payment.id, "verify", normalizedStatus, verifyPayload);
    if (shouldNotify) {
      await notifyPaymentState(data, normalizedStatus);
    }
    return { payment: data, finalized: false };
  }

  if (payment.status === "paid" && purpose === "wallet_topup") {
    if (!(await walletTopupAlreadyCredited(payment))) {
      await creditWalletFromPayment(payment);
    }
    await appendPaymentEvent(payment.id, "verify", "paid", verifyPayload);
    return { payment, finalized: true };
  }

  if (payment.status === "paid" && payment.related_order_id) {
    await appendPaymentEvent(payment.id, "verify", "paid", verifyPayload);
    return { payment, finalized: true };
  }

  let relatedOrderId = payment.related_order_id;

  if (purpose === "wallet_topup" && payment.status !== "paid") {
    await creditWalletFromPayment(payment);
  } else if (purpose === "campus_market_order" && !relatedOrderId) {
    relatedOrderId = await createCampusMarketOrderFromPayment(payment);
  }

  let nextMetadata = asObject(payment.metadata);
  if (purpose === "campus_market_order" && relatedOrderId) {
    const existingHandoff = asObject(nextMetadata.handoff);
    if (!existingHandoff.delivery_pin || !existingHandoff.qr_token) {
      nextMetadata = mergeMetadata(payment, {
        handoff: {
          ...createHandoffSecurity(relatedOrderId),
          ...existingHandoff,
        },
      });
    }
  }

  const { data, error } = await supabase
    .from("payments")
    .update({
      status: "paid",
      related_order_id: relatedOrderId,
      metadata: nextMetadata,
      provider_payload: verifyPayload,
      external_reference: externalReference,
      verified_at: new Date().toISOString(),
      paid_at: paidAt || new Date().toISOString(),
    })
    .eq("id", payment.id)
    .select("*")
    .single();
  throwIfError(error);

  await appendPaymentEvent(payment.id, "verify", "paid", verifyPayload);
  await notifyPaymentState(data, "paid");
  if (purpose === "campus_market_order" && relatedOrderId) {
    await upsertOrderHandoff({
      orderId: relatedOrderId,
      paymentId: data.id,
      handoff: asObject(nextMetadata.handoff),
    });
    await notifyCampusOrderCreated(relatedOrderId);
  }
  return { payment: data, finalized: true };
}

export async function finalizePaymentByReference(reference, verifyPayload) {
  const payment = await findPaymentByReference(reference);
  if (!payment) throw new Error(`Payment not found for reference ${reference}.`);
  return finalizePayment(payment, verifyPayload);
}

export async function createCampusMarketWalletCheckout({ userId, email, orderDraft, title, description }) {
  const customerId = await resolveProfileUserId(userId, email);
  if (!customerId) throw new Error("Wallet checkout is missing a valid customer profile.");

  const { data, error } = await supabase.rpc("wallet_checkout_campus_market", {
    p_user_id: customerId,
    p_customer_email: email || null,
    p_title: title || "Wallet order payment",
    p_description: description || "Wallet payment",
    p_order: orderDraft,
  });

  if (error) {
    const message = String(error.message || "");
    if (/schema\s+"campus_market"\s+does\s+not\s+exist/i.test(message)) {
      return createCampusMarketWalletCheckoutFallback({
        userId: customerId,
        email,
        orderDraft,
        title,
        description,
      });
    }
    throwIfError(error);
  }

  const result = asObject(data);
  const orderId = typeof result.order_id === "string" ? result.order_id : null;
  const paymentId = typeof result.payment_id === "string" ? result.payment_id : null;
  const walletActivityId = typeof result.wallet_activity_id === "string" ? result.wallet_activity_id : null;

  if (!orderId || !paymentId || !walletActivityId) {
    throw new Error("Wallet checkout did not return the expected order and payment details.");
  }

  await notifyCampusOrderCreated(orderId);

  return {
    orderId,
    payment: { id: paymentId },
    wallet: { balance_mwk: Number(result.wallet_balance_mwk || 0) },
    activity: { id: walletActivityId },
  };
}

export async function createCampusMarketCashCheckout({ userId, email, orderDraft, title, description }) {
  const customerId = await resolveProfileUserId(userId, email);
  if (!customerId) throw new Error("Cash checkout is missing a valid customer profile.");

  const prepared = await prepareCampusMarketOrderDraft({ customerId, orderDraft });
  const orderId = await insertCampusMarketOrder(prepared);
  const handoff = createHandoffSecurity(orderId);
  const paymentReference = `cash_${orderId}`;
  const now = new Date().toISOString();

  const { data: payment, error: paymentError } = await supabase
    .from("payments")
    .insert({
      user_id: customerId,
      purpose: "cash_order_payment",
      related_order_id: orderId,
      project: "eya",
      provider: "cash",
      method: "cash",
      reference: paymentReference,
      tx_ref: paymentReference,
      currency: "MWK",
      amount_mwk: Math.round(prepared.total),
      title: title || "Cash order payment",
      description: description || "Cash on delivery order",
      customer_email: email || null,
      status: "paid",
      metadata: {
        purpose: "campus_market_order",
        payment_source: "cash",
        payment_method: "cash",
        payment_method_label: "Cash on Delivery",
        settlement: "collect_on_delivery",
        order: orderDraft,
        handoff,
      },
      provider_payload: {
        source: "cash",
        settlement: "collect_on_delivery",
      },
      verified_at: now,
      paid_at: now,
    })
    .select("id")
    .single();
  throwIfError(paymentError);

  await appendPaymentEvent(payment.id, "cash_checkout", "paid", {
    order_id: orderId,
    settlement: "collect_on_delivery",
  });

  await upsertOrderHandoff({
    orderId,
    paymentId: payment.id,
    handoff,
  });

  await notifyPaymentState(
    {
      id: payment.id,
      user_id: customerId,
      related_order_id: orderId,
      status: "paid",
      provider: "cash",
      method: "cash",
      amount_mwk: Math.round(prepared.total),
      title: title || "Cash order payment",
      description: description || "Cash on delivery order",
      customer_email: email || null,
      reference: paymentReference,
      metadata: {
        purpose: "campus_market_order",
        payment_source: "cash",
        payment_method: "cash",
        payment_method_label: "Cash on Delivery",
      },
    },
    "paid",
  );
  await notifyCampusOrderCreated(orderId);

  return {
    orderId,
    payment: { id: payment.id, reference: paymentReference },
  };
}

export async function getPaymentByRelatedOrderId(orderId) {
  const { data, error } = await supabase
    .from("payments")
    .select("*")
    .eq("related_order_id", orderId)
    .eq("status", "paid")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  throwIfError(error);
  return data;
}

export async function markHandoffVerified(orderId, verifier, proof) {
  const payment = await getPaymentByRelatedOrderId(orderId);
  if (!payment) throw new Error("Paid order not found.");

  const metadata = asObject(payment.metadata);
  const handoffRow = await getOrderHandoffByOrderId(orderId);
  const handoff = handoffRow
    ? {
        ...handoffRow,
        verified_by: handoffRow.verified_by || null,
      }
    : asObject(metadata.handoff);
  if (!handoff.delivery_pin || !handoff.qr_token) throw new Error("Handoff security is not set for this order.");

  const pinMatches = typeof proof?.pin === "string" && proof.pin.trim() === String(handoff.delivery_pin);
  const tokenMatches = typeof proof?.qr_token === "string" && proof.qr_token.trim() === String(handoff.qr_token);

  if (!pinMatches && !tokenMatches) {
    throw new Error("Invalid delivery verification code.");
  }

  const { data: delivery, error: deliveryLookupError } = await supabaseNewApp
    .from("deliveries")
    .select("order_id,status,driver_id,delivered_at")
    .eq("order_id", orderId)
    .maybeSingle();
  throwIfError(deliveryLookupError);
  if (!delivery) throw new Error("Delivery record not found.");

  const deliveryStatus = String(delivery.status || "").toLowerCase();
  if (!handoff.verified_at && deliveryStatus !== "arriving" && deliveryStatus !== "delivered") {
    throw new Error("Delivery must be marked arriving before handoff verification.");
  }

  if (handoff.verified_at) {
    return {
      ...payment,
      metadata: {
        ...metadata,
        handoff: {
          ...asObject(metadata.handoff),
          ...handoff,
        },
      },
    };
  }

  const nextMetadata = {
    ...metadata,
    handoff: {
      ...handoff,
      verified_at: new Date().toISOString(),
      verified_by: verifier || null,
      verification_method: pinMatches ? "pin" : "qr",
    },
  };

  const { data, error } = await supabase
    .from("payments")
    .update({ metadata: nextMetadata })
    .eq("id", payment.id)
    .select("*")
    .single();
  throwIfError(error);

  await upsertOrderHandoff({
    orderId,
    paymentId: payment.id,
    handoff: nextMetadata.handoff,
  });

  const { error: deliveryUpdateError } = await supabaseNewApp
    .from("deliveries")
    .update({
      status: "delivered",
      delivered_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("order_id", orderId);
  if (deliveryUpdateError && !String(deliveryUpdateError.message || "").toLowerCase().includes("0 rows")) {
    throw new Error(deliveryUpdateError.message);
  }

  const { error: orderError } = await supabaseNewApp
    .from("orders")
    .update({
      status: "delivered",
      payment_status: "paid",
      updated_at: new Date().toISOString(),
    })
    .eq("id", orderId);
  throwIfError(orderError);

  await appendPaymentEvent(payment.id, "handoff_verified", "paid", {
    order_id: orderId,
    verifier,
    method: pinMatches ? "pin" : "qr",
  });
  await notifyOrderDelivered(orderId);

  return data;
}
