import cors from "cors";
import express from "express";
import { config, getCancelUrl, getSuccessUrl, requireCoreConfig } from "./config.js";
import QRCode from "qrcode";
import { createCampusMarketWalletCheckout, finalizePaymentByReference, findPaymentByAnyReference, findPaymentByReference, getOrderHandoffByOrderId, getPaymentByRelatedOrderId, markHandoffVerified, recordPaymentInitiation } from "./fulfillment.js";
import { createDirectCharge, verifyDirectCharge, verifyTransaction, verifyWebhookSignature } from "./paychangu.js";
import { notifyDeliveryStatusChanged, notifyDriverAssigned, notifySupportTicketUpdated, sendPushNotificationsToUsers } from "./push.js";
import { supabase, supabaseNewApp } from "./supabase.js";

requireCoreConfig();

const app = express();

app.use(cors());
app.use(
  express.json({
    verify: (req, _res, buf) => {
      req.rawBody = buf.toString("utf8");
    },
  }),
);

app.get("/", (_req, res) => {
  res.json({
    status: "ok",
    service: "paychangu-backend",
    health: "/health",
  });
});

function sendError(res, status, message, extra = {}) {
  res.status(status).json({
    status: "error",
    message,
    ...extra,
  });
}

function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

const ORDER_STATUSES = new Set(["pending", "accepted", "preparing", "picked_up", "on_the_way", "delivered", "cancelled"]);
const DELIVERY_STATUSES = new Set(["searching", "assigned", "picked_up", "arriving", "delivered", "failed", "cancelled"]);

async function getProfileById(userId) {
  if (!userId) return null;
  const { data, error } = await supabase.from("profiles").select("id,role,full_name").eq("id", userId).maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

async function requireAuthenticatedUser(req) {
  const authHeader = req.header("authorization") || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
  if (!token) throw new Error("Missing bearer token.");

  const { data, error } = await supabase.auth.getUser(token);
  if (error) throw new Error(error.message);
  if (!data?.user?.id) throw new Error("Invalid session.");

  const profile = await getProfileById(data.user.id);
  return { user: data.user, profile };
}

function actorIdFromHeaders(req) {
  const direct = req.header("x-actor-user-id") || req.header("x-user-id");
  return typeof direct === "string" && direct.trim() ? direct.trim() : null;
}

async function requireAdmin(req) {
  const userId = req.header("x-admin-user-id") || actorIdFromHeaders(req);
  if (!userId) throw new Error("Missing admin identity header.");
  const profile = await getProfileById(String(userId));
  if (!profile || profile.role !== "admin") throw new Error("Admin access required.");
  return profile;
}

async function getDeliveryByOrderId(orderId) {
  const { data, error } = await supabaseNewApp
    .from("deliveries")
    .select("id,order_id,driver_id,status,eta_minutes,delivered_at,created_at,updated_at")
    .eq("order_id", orderId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

async function getVendorById(vendorId) {
  const { data, error } = await supabaseNewApp
    .from("vendors")
    .select("id,owner_id,name,campus,area")
    .eq("id", vendorId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

async function getOrCreateWalletAccount(userId) {
  const { data, error } = await supabase
    .from("wallet_accounts")
    .select("user_id,balance_mwk,points,created_at,updated_at")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (data) return data;

  const { data: created, error: createError } = await supabase
    .from("wallet_accounts")
    .insert({ user_id: userId, balance_mwk: 0, points: 0 })
    .select("user_id,balance_mwk,points,created_at,updated_at")
    .single();
  if (createError) throw new Error(createError.message);
  return created;
}

async function createWalletActivity({ userId, label, amountMwk, type, meta = {} }) {
  const { data, error } = await supabase
    .from("wallet_activities")
    .insert({
      user_id: userId,
      label,
      amount_mwk: amountMwk,
      type,
      meta,
    })
    .select("id,label,amount_mwk,type,meta,created_at")
    .single();
  if (error) throw new Error(error.message);
  return data;
}

async function calculateWalletBalanceFromActivities(userId) {
  const { data, error } = await supabase
    .from("wallet_activities")
    .select("amount_mwk")
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
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
    .select("user_id,balance_mwk,points,created_at,updated_at")
    .single();
  if (error) throw new Error(error.message);
  return data;
}

async function appendWalletActivityAndSync({ userId, label, amountMwk, type, meta = {} }) {
  await getOrCreateWalletAccount(userId);
  const activity = await createWalletActivity({ userId, label, amountMwk, type, meta });
  const account = await syncWalletAccountFromActivities(userId);
  return { activity, account };
}

async function getOrderDetailPayload(orderId) {
  const { data: order, error: orderError } = await supabaseNewApp
    .from("orders")
    .select("id,customer_id,vendor_id,channel,status,delivery_mode,pickup_notes,dropoff_notes,subtotal_mwk,delivery_fee_mwk,service_fee_mwk,total_mwk,payment_status,created_at,updated_at")
    .eq("id", orderId)
    .maybeSingle();
  if (orderError) throw new Error(orderError.message);
  if (!order) return null;

  const [{ data: items, error: itemError }, delivery, { data: handoff, error: handoffError }, { data: payment, error: paymentError }, vendor, { data: customer, error: customerError }] = await Promise.all([
    supabaseNewApp.from("order_items").select("id,item_id,item_name_snapshot,quantity,unit_price_mwk,line_total_mwk,created_at").eq("order_id", orderId).order("created_at", { ascending: true }),
    getDeliveryByOrderId(orderId),
    supabaseNewApp.from("order_handoffs").select("order_reference,verification_method,verified_at,verified_by").eq("order_id", orderId).maybeSingle(),
    supabase.from("payments").select("id,reference,status,amount_mwk,paid_at,verified_at").eq("related_order_id", orderId).order("created_at", { ascending: false }).limit(1).maybeSingle(),
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

function ensurePaidOrder(order, payment) {
  const paymentStatus = String(payment?.status || "").toLowerCase();
  const orderPaymentStatus = String(order?.payment_status || "").toLowerCase();
  return paymentStatus === "paid" && orderPaymentStatus === "paid";
}

async function assertDeliveryActor(req, orderId) {
  const actorId = actorIdFromHeaders(req);
  if (!actorId) throw new Error("Missing actor identity header.");

  const [profile, detail] = await Promise.all([getProfileById(actorId), getOrderDetailPayload(orderId)]);
  if (!detail) throw new Error("Order not found.");

  const isAdmin = profile?.role === "admin";
  const isAssignedDriver = detail.delivery?.driver_id === actorId;
  const isVendorOwner = detail.vendor?.owner_id === actorId;

  if (!isAdmin && !isAssignedDriver && !isVendorOwner) {
    throw new Error("Not allowed to manage this delivery.");
  }

  return { actorId, profile, detail };
}

function canViewHandoff(detail, userId, role) {
  if (!detail?.order || !userId) return false;
  if (role === "admin") return true;
  if (detail.order.customer_id === userId) return true;
  if (detail.delivery?.driver_id === userId) return true;
  if (detail.vendor?.owner_id === userId) return true;
  return false;
}

function canVerifyHandoff(detail, userId, role) {
  if (!detail?.order || !userId) return false;
  if (role === "admin") return true;
  if (detail.delivery?.driver_id === userId) return true;
  if (detail.vendor?.owner_id === userId) return true;
  return false;
}

function normalizeInitiateBody(body) {
  return {
    amount: body?.amount,
    currency: body?.currency,
    email: body?.email,
    first_name: body?.first_name,
    last_name: body?.last_name,
    tx_ref: body?.tx_ref || body?.txRef,
    title: body?.title || body?.customization?.title,
    description: body?.description || body?.customization?.description,
    project: body?.project,
    meta: body?.meta,
  };
}

function extractVerifyAmount(payload) {
  const candidates = [
    payload?.data?.transaction?.amount,
    payload?.transaction?.amount,
    payload?.data?.amount,
    payload?.amount,
  ];
  for (const candidate of candidates) {
    const amount = Number(candidate);
    if (Number.isFinite(amount) && amount > 0) return amount;
  }
  return 0;
}

function extractVerifyCurrency(payload) {
  const candidates = [
    payload?.data?.transaction?.currency,
    payload?.transaction?.currency,
    payload?.data?.currency,
    payload?.currency,
  ];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
  }
  return "MWK";
}

function inferMethodFromVerifyPayload(payload, fallbackMethod) {
  if (fallbackMethod === "airtel_money" || fallbackMethod === "mpamba" || fallbackMethod === "bank_transfer") {
    return fallbackMethod;
  }

  const providerText = [
    payload?.data?.transaction?.authorization?.provider,
    payload?.transaction?.authorization?.provider,
    payload?.data?.transaction?.authorization?.channel,
    payload?.transaction?.authorization?.channel,
  ]
    .filter((value) => typeof value === "string" && value.trim())
    .join(" ")
    .toLowerCase();

  if (providerText.includes("airtel")) return "airtel_money";
  if (providerText.includes("mpamba") || providerText.includes("tnm")) return "mpamba";
  if (providerText.includes("bank")) return "bank_transfer";
  return "airtel_money";
}

function summarizeSupabaseUrl(value) {
  try {
    const url = new URL(value);
    return {
      origin: url.origin,
      host: url.host,
    };
  } catch {
    return {
      origin: value || null,
      host: null,
    };
  }
}

async function verifyDirectChargeWithoutRecord(reference, preferredMethod) {
  const methods = [
    preferredMethod,
    "airtel_money",
    "mpamba",
    "bank_transfer",
  ].filter((value, index, array) => (value === "airtel_money" || value === "mpamba" || value === "bank_transfer") && array.indexOf(value) === index);

  let lastError = null;
  for (const method of methods) {
    try {
      const data = await verifyDirectCharge(reference, method);
      return { data, method };
    } catch (error) {
      lastError = error;
    }
  }

  if (lastError) throw lastError;
  throw new Error("Could not verify direct charge.");
}

async function verifyPaymentForRecord(reference, payment) {
  const method = typeof payment?.method === "string" ? payment.method : "";
  if (method === "airtel_money" || method === "mpamba" || method === "bank_transfer") {
    return verifyDirectCharge(reference, method);
  }
  return verifyTransaction(reference);
}

app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    service: "paychangu-backend",
    success_url: getSuccessUrl(),
    cancel_url: getCancelUrl(),
  });
});

app.get("/api/wallet/me", async (req, res) => {
  try {
    const { user } = await requireAuthenticatedUser(req);
    const [account, activitiesRes] = await Promise.all([
      syncWalletAccountFromActivities(user.id),
      supabase
        .from("wallet_activities")
        .select("id,label,amount_mwk,type,meta,created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(120),
    ]);

    if (activitiesRes.error) throw new Error(activitiesRes.error.message);

    return res.json({
      status: "success",
      account,
      activities: activitiesRes.data || [],
    });
  } catch (error) {
    return sendError(res, 401, error instanceof Error ? error.message : "Could not load wallet.");
  }
});

app.get("/api/wallet/debug", async (req, res) => {
  try {
    const { user, profile } = await requireAuthenticatedUser(req);
    const reference = String(req.query?.reference || "").trim();

    const [walletAccount, walletActivitiesRes, walletPaymentsRes, matchedPayment] = await Promise.all([
      syncWalletAccountFromActivities(user.id),
      supabase
        .from("wallet_activities")
        .select("id,label,amount_mwk,type,meta,created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(20),
      supabase
        .from("payments")
        .select("id,user_id,purpose,reference,tx_ref,status,amount_mwk,method,customer_email,created_at,updated_at,metadata")
        .eq("user_id", user.id)
        .in("purpose", ["wallet_topup", "wallet_order_payment"])
        .order("created_at", { ascending: false })
        .limit(20),
      reference ? findPaymentByAnyReference(reference) : Promise.resolve(null),
    ]);

    if (walletActivitiesRes.error) throw new Error(walletActivitiesRes.error.message);
    if (walletPaymentsRes.error) throw new Error(walletPaymentsRes.error.message);

    return res.json({
      status: "success",
      backend: {
        service: "paychangu-backend",
        supabase: summarizeSupabaseUrl(config.supabaseUrl),
        schema: "public",
      },
      actor: {
        auth_user_id: user.id,
        email: user.email || null,
        profile_id: profile?.id || null,
        role: profile?.role || null,
      },
      wallet_account: walletAccount,
      wallet_activities: walletActivitiesRes.data || [],
      wallet_payments: walletPaymentsRes.data || [],
      matched_payment: matchedPayment,
      reference_checked: reference || null,
    });
  } catch (error) {
    return sendError(res, 401, error instanceof Error ? error.message : "Could not load wallet debug state.");
  }
});

app.post("/api/wallet/withdraw", async (req, res) => {
  try {
    const { user } = await requireAuthenticatedUser(req);
    const amount = Number(req.body?.amount_mwk);
    const destination = typeof req.body?.destination === "string" ? req.body.destination.trim() : "";
    if (!Number.isFinite(amount) || amount <= 0) return sendError(res, 400, "A valid withdrawal amount is required.");
    if (!destination) return sendError(res, 400, "A withdrawal destination is required.");

    await getOrCreateWalletAccount(user.id);
    const currentBalance = await calculateWalletBalanceFromActivities(user.id);
    if (currentBalance < amount) return sendError(res, 400, "Insufficient wallet balance.");

    const { account: nextAccount, activity } = await appendWalletActivityAndSync({
      userId: user.id,
      label: `Withdrawal to ${destination}`,
      amountMwk: -amount,
      type: "payment",
      meta: { kind: "withdraw", destination },
    });

    return res.json({
      status: "success",
      account: nextAccount,
      activity,
    });
  } catch (error) {
    return sendError(res, 401, error instanceof Error ? error.message : "Could not submit withdrawal.");
  }
});

app.post("/api/wallet/send", async (req, res) => {
  try {
    const { user, profile } = await requireAuthenticatedUser(req);
    const amount = Number(req.body?.amount_mwk);
    const recipientPhone = typeof req.body?.recipient_phone === "string" ? req.body.recipient_phone.trim() : "";
    const recipientName = typeof req.body?.recipient_name === "string" ? req.body.recipient_name.trim() : "";

    if (!Number.isFinite(amount) || amount <= 0) return sendError(res, 400, "A valid transfer amount is required.");
    if (!recipientPhone) return sendError(res, 400, "Recipient phone is required.");

    const { data: recipient, error: recipientError } = await supabase
      .from("profiles")
      .select("id,full_name,phone")
      .eq("phone", recipientPhone)
      .maybeSingle();
    if (recipientError) throw new Error(recipientError.message);
    if (!recipient?.id) return sendError(res, 404, "Recipient not found.");
    if (recipient.id === user.id) return sendError(res, 400, "You cannot send money to yourself.");

    await Promise.all([getOrCreateWalletAccount(user.id), getOrCreateWalletAccount(recipient.id)]);
    const senderBalance = await calculateWalletBalanceFromActivities(user.id);
    if (senderBalance < amount) return sendError(res, 400, "Insufficient wallet balance.");

    const resolvedRecipientName = recipientName || recipient.full_name || recipient.phone || "Recipient";
    const senderLabel = `Money sent to ${resolvedRecipientName}`;
    const receiverLabel = `Money received from ${profile?.full_name || user.email || "Pamaketi user"}`;

    const [{ account: nextSender, activity: senderActivity }, { account: nextReceiver, activity: receiverActivity }] = await Promise.all([
      appendWalletActivityAndSync({
        userId: user.id,
        label: senderLabel,
        amountMwk: -amount,
        type: "payment",
        meta: { kind: "transfer_out", recipient_user_id: recipient.id, recipient_phone: recipientPhone },
      }),
      appendWalletActivityAndSync({
        userId: recipient.id,
        label: receiverLabel,
        amountMwk: amount,
        type: "reward",
        meta: { kind: "transfer_in", sender_user_id: user.id },
      }),
    ]);

    await sendPushNotificationsToUsers([recipient.id], {
      title: "Money received",
      body: `${profile?.full_name || "Someone"} sent you MWK ${amount.toLocaleString("en-MW")}.`,
      type: "wallet_transfer_received",
      data: { senderUserId: user.id, amountMwk: amount },
    });

    return res.json({
      status: "success",
      account: nextSender,
      activity: senderActivity,
      recipient: {
        id: recipient.id,
        name: resolvedRecipientName,
        phone: recipient.phone,
        account: nextReceiver,
        activity: receiverActivity,
      },
    });
  } catch (error) {
    return sendError(res, 401, error instanceof Error ? error.message : "Could not send wallet transfer.");
  }
});

app.post("/api/wallet/request", async (req, res) => {
  try {
    const { user, profile } = await requireAuthenticatedUser(req);
    const amount = Number(req.body?.amount_mwk);
    const recipientPhone = typeof req.body?.recipient_phone === "string" ? req.body.recipient_phone.trim() : "";
    const recipientName = typeof req.body?.recipient_name === "string" ? req.body.recipient_name.trim() : "";

    if (!Number.isFinite(amount) || amount <= 0) return sendError(res, 400, "A valid request amount is required.");
    if (!recipientPhone) return sendError(res, 400, "Recipient phone is required.");

    const { data: recipient, error: recipientError } = await supabase
      .from("profiles")
      .select("id,full_name,phone")
      .eq("phone", recipientPhone)
      .maybeSingle();
    if (recipientError) throw new Error(recipientError.message);
    if (!recipient?.id) return sendError(res, 404, "Recipient not found.");

    const fromLabel = profile?.full_name || user.email || "Pamaketi user";
    await sendPushNotificationsToUsers([recipient.id], {
      title: "Money request",
      body: `${fromLabel} requested MWK ${amount.toLocaleString("en-MW")} from you.`,
      type: "wallet_request",
      data: { requesterUserId: user.id, amountMwk: amount, requesterName: fromLabel },
    });

    return res.json({
      status: "success",
      request: {
        amount_mwk: amount,
        recipient_name: recipientName || recipient.full_name || recipient.phone,
        recipient_phone: recipient.phone,
      },
    });
  } catch (error) {
    return sendError(res, 401, error instanceof Error ? error.message : "Could not send money request.");
  }
});

  app.post("/api/wallet/checkout", async (req, res) => {
    try {
      const { user } = await requireAuthenticatedUser(req);
    const purpose = typeof req.body?.purpose === "string" ? req.body.purpose.trim() : "";
    const orderDraft = asObject(req.body?.order);
    const title = typeof req.body?.title === "string" ? req.body.title.trim() : "Wallet order payment";
    const description = typeof req.body?.description === "string" ? req.body.description.trim() : "Wallet payment";

    if (purpose !== "campus_market_order") {
      return sendError(res, 400, "Wallet checkout currently supports campus market orders only.");
    }
    if (!orderDraft.vendor_id || !orderDraft.channel || !Array.isArray(orderDraft.lines) || !orderDraft.lines.length) {
      return sendError(res, 400, "Wallet checkout is missing order details.");
    }

    const result = await createCampusMarketWalletCheckout({
      userId: user.id,
      email: user.email || null,
      orderDraft,
      title,
      description,
    });

      return res.json({
        status: "success",
        payment_status: "paid",
        method: "wallet",
        order_id: result.orderId,
        payment_id: result.payment.id,
        wallet_balance_mwk: Number(result.wallet.balance_mwk || 0),
        wallet_activity_id: result.activity.id,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not complete wallet checkout.";
      const status = /bearer token|authorization|required|authenticated|invalid jwt|missing access token/i.test(message)
        ? 401
        : /insufficient wallet balance|missing order details|invalid|not found|support/i.test(message)
          ? 400
          : 500;
      return sendError(res, status, message);
    }
  });

app.post("/api/paychangu/initiate", async (req, res) => {
  const input = normalizeInitiateBody(req.body);
  const amount = Number(input.amount);

  if (!Number.isFinite(amount) || amount <= 0) {
    return sendError(res, 400, "A valid positive amount is required.");
  }

  try {
    const session = await createDirectCharge(input);
    const payment = await recordPaymentInitiation({
      input,
      checkoutUrl: null,
      providerPayload: session.raw,
      txRef: session.chargeId,
    });

    return res.json({
      status: "success",
      message: "Direct charge initialized successfully.",
      tx_ref: session.chargeId,
      payment_id: payment.id,
      direct_charge: {
        status: session.status,
        provider_reference: session.providerReference,
        payment_account_details: session.paymentAccountDetails,
        authorization: session.authorization,
      },
      data: session.raw,
    });
  } catch (error) {
    return sendError(res, 502, error instanceof Error ? error.message : "Could not initialize PayChangu payment.");
  }
});

app.get("/api/paychangu/verify/:txRef", async (req, res) => {
  const txRef = String(req.params.txRef || "").trim();
  if (!txRef) {
    return sendError(res, 400, "Transaction reference is required.");
  }

  try {
    const payment = await findPaymentByReference(txRef);
    if (!payment) {
      return sendError(res, 404, `Payment not found for reference ${txRef}.`);
    }

    const data = await verifyPaymentForRecord(txRef, payment);
    const finalized = await finalizePaymentByReference(txRef, data);
    return res.json({
      ...data,
      payment_status: finalized.payment.status,
      payment_id: finalized.payment.id,
      related_order_id: finalized.payment.related_order_id,
      fulfilled: finalized.finalized,
    });
  } catch (error) {
    return sendError(res, 502, error instanceof Error ? error.message : "Could not verify transaction.");
  }
});

app.post("/api/paychangu/reconcile", async (req, res) => {
  const reference = String(req.body?.reference || req.body?.tx_ref || req.body?.charge_id || "").trim();
  const methodHint = typeof req.body?.method === "string" ? req.body.method.trim() : "";
  const purposeHint = typeof req.body?.purpose === "string" ? req.body.purpose.trim() : "";
  if (!reference) {
    return sendError(res, 400, "A payment reference is required.");
  }

  try {
    const { user, profile } = await requireAuthenticatedUser(req);
    let payment = await findPaymentByAnyReference(reference);
    let verifyData;

    if (!payment) {
      if (purposeHint !== "wallet_topup") {
        return sendError(res, 404, `Payment not found for reference ${reference}.`);
      }
      const verified = await verifyDirectChargeWithoutRecord(reference, methodHint);
      verifyData = verified.data;
      const inferredMethod = inferMethodFromVerifyPayload(verifyData, verified.method);
      const amount = extractVerifyAmount(verifyData);
      if (!amount) {
        return sendError(res, 422, "Verified payment did not include a usable amount.");
      }

      payment = await recordPaymentInitiation({
        input: {
          amount,
          currency: extractVerifyCurrency(verifyData),
          email: user.email || null,
          first_name: user.user_metadata?.first_name || null,
          last_name: user.user_metadata?.last_name || null,
          tx_ref: reference,
          title: "Pamaketi wallet top-up",
          description: `Recovered wallet top-up ${reference}`,
          project: "pa-level",
          meta: {
            purpose: "wallet_topup",
            user_id: user.id,
            payment_method: inferredMethod,
          },
        },
        checkoutUrl: null,
        providerPayload: verifyData,
        txRef: reference,
      });
    }

    const ownsPayment = payment.user_id === user.id;
    const isAdmin = profile?.role === "admin";
    if (!ownsPayment && !isAdmin) {
      return sendError(res, 403, "Not allowed to reconcile this payment.");
    }

    const verifyKey = typeof payment.reference === "string" && payment.reference.trim() ? payment.reference.trim() : reference;
    verifyData = verifyData || await verifyPaymentForRecord(verifyKey, payment);
    const finalized = await finalizePaymentByReference(verifyKey, verifyData);

    let walletBalanceMwk = null;
    if (String(finalized.payment?.metadata?.purpose || payment?.metadata?.purpose || "").trim() === "wallet_topup") {
      const account = await syncWalletAccountFromActivities(user.id);
      walletBalanceMwk = Number(account?.balance_mwk || 0);
    }

    return res.json({
      status: "success",
      message: "Payment reconciliation completed.",
      payment_status: finalized.payment.status,
      payment_id: finalized.payment.id,
      reference: finalized.payment.reference,
      tx_ref: finalized.payment.tx_ref,
      related_order_id: finalized.payment.related_order_id || null,
      wallet_balance_mwk: walletBalanceMwk,
      fulfilled: finalized.finalized,
      verify: verifyData,
    });
  } catch (error) {
    return sendError(res, 502, error instanceof Error ? error.message : "Could not reconcile payment.");
  }
});

app.post("/api/paychangu/webhook", async (req, res) => {
  const signature = req.header("Signature");
  const rawBody = req.rawBody || "";

  if (!verifyWebhookSignature(rawBody, signature)) {
    return sendError(res, 401, "Invalid webhook signature.");
  }

  const event = req.body;
  console.log("[paychangu-webhook]", JSON.stringify(event));
  const reference =
    event?.charge_id ||
    event?.data?.charge_id ||
    event?.data?.transaction?.charge_id ||
    event?.transaction?.charge_id ||
    event?.reference ||
    event?.tx_ref ||
    event?.data?.reference ||
    event?.data?.tx_ref ||
    event?.data?.transaction?.ref_id ||
    event?.transaction?.ref_id ||
    null;

  if (reference) {
    try {
      const payment = await findPaymentByAnyReference(String(reference));
      const verifyKey = payment?.reference || String(reference);
      const verifyData = payment ? await verifyPaymentForRecord(String(verifyKey), payment) : await verifyTransaction(String(reference));
      await finalizePaymentByReference(String(verifyKey), verifyData);
    } catch (error) {
      console.error("[paychangu-webhook-finalize-error]", error instanceof Error ? error.message : error);
    }
  }

  return res.status(200).json({ received: true });
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
    if (!payment) return sendError(res, 404, "Paid order not found.");

    const metadata = asObject(payment.metadata);
    const handoffRow = await getOrderHandoffByOrderId(orderId);
    const handoff = handoffRow ? asObject(handoffRow) : asObject(metadata.handoff);
    const orderDraft = asObject(metadata.order);

    const order = detail.order;
    if (!ensurePaidOrder(order, payment)) {
      return sendError(res, 409, "Invoice and handoff pass are available only after backend payment confirmation.");
    }

    const { data: items, error: itemError } = await supabaseNewApp
      .from("order_items")
      .select("item_name_snapshot, quantity, line_total_mwk")
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
    });
  } catch (error) {
    return sendError(res, 500, error instanceof Error ? error.message : "Could not load handoff details.");
  }
});

app.post("/api/orders/:orderId/handoff/verify", async (req, res) => {
  const orderId = String(req.params.orderId || "").trim();
  if (!orderId) return sendError(res, 400, "Order id is required.");

  const pin = typeof req.body?.pin === "string" ? req.body.pin : null;
  const qrToken = typeof req.body?.qr_token === "string" ? req.body.qr_token : null;

  if (!pin && !qrToken) {
    return sendError(res, 400, "Provide a delivery pin or qr_token.");
  }

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
    return sendError(res, 400, error instanceof Error ? error.message : "Could not verify delivery handoff.");
  }
});

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
    return sendError(res, 403, error instanceof Error ? error.message : "Could not load payments.");
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
      .eq("payment_status", "paid")
      .order("created_at", { ascending: false })
      .limit(limit);
    if (status) query = query.eq("status", status);

    const { data: orders, error } = await query;
    if (error) throw new Error(error.message);

    const orderIds = (orders || []).map((row) => row.id);
    const vendorIds = [...new Set((orders || []).map((row) => row.vendor_id))];

    const [{ data: deliveries, error: deliveryError }, { data: handoffs, error: handoffError }, { data: vendors, error: vendorError }] = await Promise.all([
      orderIds.length ? supabaseNewApp.from("deliveries").select("order_id,driver_id,status,eta_minutes,updated_at").in("order_id", orderIds) : Promise.resolve({ data: [], error: null }),
      orderIds.length ? supabaseNewApp.from("order_handoffs").select("order_id,order_reference,verified_at").in("order_id", orderIds) : Promise.resolve({ data: [], error: null }),
      vendorIds.length ? supabaseNewApp.from("vendors").select("id,name,owner_id").in("id", vendorIds) : Promise.resolve({ data: [], error: null }),
    ]);
    if (deliveryError) throw new Error(deliveryError.message);
    if (handoffError) throw new Error(handoffError.message);
    if (vendorError) throw new Error(vendorError.message);

    const deliveriesByOrderId = new Map((deliveries || []).map((row) => [row.order_id, row]));
    const handoffsByOrderId = new Map((handoffs || []).map((row) => [row.order_id, row]));
    const vendorsById = new Map((vendors || []).map((row) => [row.id, row]));

    const rows = (orders || [])
      .map((order) => ({
        ...order,
        vendor: vendorsById.get(order.vendor_id) || null,
        delivery: deliveriesByOrderId.get(order.id) || null,
        handoff: handoffsByOrderId.get(order.id) || null,
      }))
      .filter((row) => !deliveryStatus || row.delivery?.status === deliveryStatus);

    return res.json({ status: "success", orders: rows });
  } catch (error) {
    return sendError(res, 403, error instanceof Error ? error.message : "Could not load orders.");
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
    return sendError(res, 403, error instanceof Error ? error.message : "Could not load order.");
  }
});

app.post("/api/admin/orders/:orderId/status", async (req, res) => {
  try {
    await requireAdmin(req);
    const orderId = String(req.params.orderId || "").trim();
    const status = typeof req.body?.status === "string" ? req.body.status.trim() : "";
    if (!orderId) return sendError(res, 400, "Order id is required.");
    if (!ORDER_STATUSES.has(status)) return sendError(res, 400, "Invalid order status.");

    const { data, error } = await supabaseNewApp
      .from("orders")
      .update({ status, updated_at: new Date().toISOString() })
      .eq("id", orderId)
      .select("*")
      .single();
    if (error) throw new Error(error.message);

    return res.json({ status: "success", order: data });
  } catch (error) {
    return sendError(res, 403, error instanceof Error ? error.message : "Could not update order status.");
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

    const { data: order, error: orderError } = await supabaseNewApp
      .from("orders")
      .select("id,payment_status")
      .eq("id", orderId)
      .maybeSingle();
    if (orderError) throw new Error(orderError.message);
    if (!order) return sendError(res, 404, "Order not found.");
    if (String(order.payment_status || "").toLowerCase() !== "paid") {
      return sendError(res, 409, "Driver assignment is allowed only after backend payment confirmation.");
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
    return sendError(res, 403, error instanceof Error ? error.message : "Could not assign driver.");
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
    return sendError(res, 403, error instanceof Error ? error.message : "Could not load support tickets.");
  }
});

app.post("/api/admin/support-tickets/:id/respond", async (req, res) => {
  try {
    const admin = await requireAdmin(req);
    const ticketId = String(req.params.id || "").trim();
    const status = typeof req.body?.status === "string" ? req.body.status.trim() : "";
    const adminNote = typeof req.body?.admin_note === "string" ? req.body.admin_note.trim() : "";
    if (!ticketId) return sendError(res, 400, "Ticket id is required.");

    const next = {
      admin_note: adminNote || null,
      status: status || "open",
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
    return sendError(res, 403, error instanceof Error ? error.message : "Could not update support ticket.");
  }
});

app.get("/api/deliveries/unassigned", async (req, res) => {
  try {
    const actorId = actorIdFromHeaders(req);
    if (!actorId) return sendError(res, 401, "Missing actor identity header.");
    const profile = await getProfileById(actorId);
    if (!profile || (profile.role !== "admin" && profile.role !== "agent")) {
      return sendError(res, 403, "Dispatch access required.");
    }

    const { data, error } = await supabaseNewApp
      .from("deliveries")
      .select("id,order_id,status,eta_minutes,created_at,updated_at,orders!inner(payment_status)")
      .is("driver_id", null)
      .eq("orders.payment_status", "paid")
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return res.json({ status: "success", deliveries: data || [] });
  } catch (error) {
    return sendError(res, 403, error instanceof Error ? error.message : "Could not load unassigned deliveries.");
  }
});

app.post("/api/deliveries/:orderId/assign", async (req, res) => {
  try {
    const orderId = String(req.params.orderId || "").trim();
    const driverId = typeof req.body?.driver_id === "string" ? req.body.driver_id.trim() : "";
    if (!orderId) return sendError(res, 400, "Order id is required.");
    if (!driverId) return sendError(res, 400, "driver_id is required.");

    const { actorId, detail, profile } = await assertDeliveryActor(req, orderId);
    const driver = await getProfileById(driverId);
    if (!driver || (driver.role !== "agent" && driver.role !== "admin")) {
      return sendError(res, 400, "Driver account not found or not eligible.");
    }
    if (String(detail.order.payment_status || "").toLowerCase() !== "paid") {
      return sendError(res, 409, "Driver assignment is allowed only after backend payment confirmation.");
    }

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

    await notifyDriverAssigned(orderId, driverId);
    await notifyDeliveryStatusChanged(orderId, "assigned");
    return res.json({ status: "success", delivery: data, actor_id: actorId, actor_role: profile?.role, vendor_id: detail.order.vendor_id });
  } catch (error) {
    return sendError(res, 403, error instanceof Error ? error.message : "Could not assign delivery.");
  }
});

app.post("/api/deliveries/:orderId/unassign", async (req, res) => {
  try {
    const orderId = String(req.params.orderId || "").trim();
    if (!orderId) return sendError(res, 400, "Order id is required.");

    await assertDeliveryActor(req, orderId);
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
    return sendError(res, 403, error instanceof Error ? error.message : "Could not unassign delivery.");
  }
});

app.post("/api/deliveries/:orderId/status", async (req, res) => {
  try {
    const orderId = String(req.params.orderId || "").trim();
    const status = typeof req.body?.status === "string" ? req.body.status.trim() : "";
    if (!orderId) return sendError(res, 400, "Order id is required.");
    if (!DELIVERY_STATUSES.has(status)) return sendError(res, 400, "Invalid delivery status.");

    const { actorId } = await assertDeliveryActor(req, orderId);
    const payload = {
      status,
      delivered_at: status === "delivered" ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabaseNewApp
      .from("deliveries")
      .update(payload)
      .eq("order_id", orderId)
      .select("*")
      .single();
    if (error) throw new Error(error.message);

    const orderPatch = {
      updated_at: new Date().toISOString(),
      ...(status === "delivered"
        ? { status: "delivered", payment_status: "paid" }
        : status === "picked_up"
          ? { status: "picked_up" }
          : status === "arriving"
            ? { status: "on_the_way" }
            : status === "cancelled"
              ? { status: "cancelled" }
              : {}),
    };
    await supabaseNewApp.from("orders").update(orderPatch).eq("id", orderId);

    await notifyDeliveryStatusChanged(orderId, status);
    return res.json({ status: "success", delivery: data, actor_id: actorId });
  } catch (error) {
    return sendError(res, 403, error instanceof Error ? error.message : "Could not update delivery status.");
  }
});

function renderRedirectPage({ title, heading, copy, targetUrl, buttonLabel }) {
  const escapedTarget = targetUrl ? String(targetUrl).replace(/"/g, "&quot;") : "";
  const button = targetUrl
    ? `<a class="btn" href="${escapedTarget}">${buttonLabel}</a>`
    : "";

  const autoRedirectScript = targetUrl
    ? `<script>setTimeout(function(){ window.location.href = ${JSON.stringify(targetUrl)}; }, 1200);</script>`
    : "";

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${title}</title>
    <style>
      body { font-family: Arial, sans-serif; background: #f6f7fb; color: #123; margin: 0; }
      .wrap { min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 24px; }
      .card { max-width: 420px; width: 100%; background: #fff; border: 1px solid #e6ebf5; border-radius: 18px; padding: 24px; text-align: center; }
      h1 { margin: 0 0 12px; font-size: 24px; }
      p { margin: 0 0 16px; color: #5f6b85; line-height: 1.5; }
      .btn { display: inline-block; background: #0e2756; color: #fff; text-decoration: none; padding: 12px 16px; border-radius: 999px; font-weight: 700; }
    </style>
  </head>
  <body>
    <div class="wrap">
      <div class="card">
        <h1>${heading}</h1>
        <p>${copy}</p>
        ${button}
      </div>
    </div>
    ${autoRedirectScript}
  </body>
</html>`;
}

function buildAppLink(pathname, query) {
  if (!config.appScheme) return "";
  const qs = new URLSearchParams(query).toString();
  return `${config.appScheme}://${pathname}${qs ? `?${qs}` : ""}`;
}

app.get("/pay/success", (req, res) => {
  const targetUrl = buildAppLink("pay/success", req.query);
  res.type("html").send(
    renderRedirectPage({
      title: "Payment Success",
      heading: "Payment received",
      copy: "You can return to the app while the payment is being verified.",
      targetUrl,
      buttonLabel: "Open app",
    }),
  );
});

app.get("/pay/cancel", (req, res) => {
  const targetUrl = buildAppLink("pay/cancel", req.query);
  res.type("html").send(
    renderRedirectPage({
      title: "Payment Cancelled",
      heading: "Payment not completed",
      copy: "The checkout was cancelled or failed. You can return to the app and try again.",
      targetUrl,
      buttonLabel: "Return to app",
    }),
  );
});

app.listen(config.port, () => {
  console.log(`PayChangu backend listening on http://localhost:${config.port}`);
});
