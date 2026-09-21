import { requireAuthenticatedUser, statusFromError } from "./auth.js";
import {
  finalizePaymentByReference,
  findPaymentByAnyReference,
  findPaymentByReference,
  recordPaymentInitiation,
} from "./fulfillment.js";
import {
  buildCheckoutPayload,
  createDirectCharge,
  createHostedCheckout,
  getPayChanguClientErrorMessage,
  getPayChanguClientStatus,
  isDirectChargeMethod,
  logPayChanguError,
  normalizePayChanguPaymentMethod,
  verifyDirectCharge,
  verifyTransaction,
  verifyWebhookSignature,
} from "./paychangu.js";

function sendError(res, status, message) {
  return res.status(status).json({ status: "error", error: message, message });
}

function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function normalizeInitiateBody(body) {
  const meta = asObject(body?.meta);
  const paymentMethod = normalizePayChanguPaymentMethod(meta.payment_method || body?.payment_method);
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
    meta: {
      ...meta,
      payment_method: paymentMethod || "hosted_checkout",
      msisdn: meta.msisdn || body?.msisdn || body?.phone,
    },
  };
}

async function verifyPaymentForRecord(reference, payment) {
  const method = typeof payment?.method === "string" ? payment.method : "";
  if (method === "airtel_money" || method === "mpamba" || method === "bank_transfer") {
    return verifyDirectCharge(reference, method);
  }
  return verifyTransaction(reference);
}

function safeWebhookSummary(event) {
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
  const status =
    event?.status ||
    event?.payment_status ||
    event?.data?.status ||
    event?.data?.transaction?.status ||
    event?.transaction?.status ||
    null;
  const type = event?.event || event?.type || event?.event_type || null;
  return {
    reference: typeof reference === "string" || typeof reference === "number" ? String(reference) : null,
    status: typeof status === "string" ? status : null,
    type: typeof type === "string" ? type : null,
  };
}

export function registerPayChanguRoutes(app) {
  app.post("/api/paychangu/initiate", async (req, res) => {
    const input = normalizeInitiateBody(req.body);
    const amount = Number(input.amount);
    const method = normalizePayChanguPaymentMethod(input.meta?.payment_method);

    if (!Number.isFinite(amount) || amount <= 0) {
      return sendError(res, 400, "A valid positive amount is required.");
    }

    try {
      const { user } = await requireAuthenticatedUser(req);
      if (input.meta?.purpose === "wallet_topup" || input.meta?.payment_source === "wallet") {
        return sendError(res, 410, "Wallet services are suspended.");
      }
      if (input.meta?.user_id && String(input.meta.user_id) !== user.id) {
        return sendError(res, 403, "Payment identity does not match the authenticated account.");
      }
      input.meta = { ...input.meta, user_id: user.id };
      if (user.email) input.email = user.email;

      if (method === "airtel_money" || method === "mpamba") {
        const msisdn = typeof input.meta?.msisdn === "string" ? input.meta.msisdn.trim() : "";
        if (!msisdn) return sendError(res, 400, "A valid mobile money number is required.");
      }

      if (isDirectChargeMethod(method)) {
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
      }

      const checkout = await createHostedCheckout(buildCheckoutPayload(input));
      const payment = await recordPaymentInitiation({
        input,
        checkoutUrl: checkout.checkoutUrl,
        providerPayload: checkout.raw,
        txRef: checkout.txRef,
      });
      return res.json({
        status: "success",
        message: "Hosted checkout initialized successfully.",
        checkout_url: checkout.checkoutUrl,
        tx_ref: checkout.txRef,
        payment_id: payment.id,
        data: checkout.raw,
      });
    } catch (error) {
      logPayChanguError("paychangu-initiate-error", error, { method, tx_ref: input.tx_ref });
      return sendError(
        res,
        statusFromError(error, getPayChanguClientStatus(error, 502)),
        getPayChanguClientErrorMessage(error, "Could not initialize PayChangu payment."),
      );
    }
  });

  app.get("/api/paychangu/verify/:txRef", async (req, res) => {
    const txRef = String(req.params.txRef || "").trim();
    if (!txRef) return sendError(res, 400, "Transaction reference is required.");

    try {
      const { user, profile } = await requireAuthenticatedUser(req);
      const payment = await findPaymentByReference(txRef);
      if (!payment) return sendError(res, 404, `Payment not found for reference ${txRef}.`);
      if (payment.user_id !== user.id && profile?.role !== "admin") {
        return sendError(res, 403, "Not allowed to verify this payment.");
      }
      if (String(payment?.metadata?.purpose || "").trim() === "wallet_topup") {
        return sendError(res, 410, "Wallet services are suspended. Contact support for historical payment reconciliation.");
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
      logPayChanguError("paychangu-verify-error", error, { tx_ref: txRef });
      return sendError(
        res,
        statusFromError(error, getPayChanguClientStatus(error, 502)),
        getPayChanguClientErrorMessage(error, "Could not verify transaction."),
      );
    }
  });

  app.post("/api/paychangu/reconcile", async (req, res) => {
    const reference = String(req.body?.reference || req.body?.tx_ref || req.body?.charge_id || "").trim();
    const purposeHint = typeof req.body?.purpose === "string" ? req.body.purpose.trim() : "";
    if (!reference) return sendError(res, 400, "A payment reference is required.");

    try {
      const { user, profile } = await requireAuthenticatedUser(req);
      const payment = await findPaymentByAnyReference(reference);
      if (!payment) return sendError(res, 404, `Payment not found for reference ${reference}.`);
      if (purposeHint === "wallet_topup" || String(payment?.metadata?.purpose || "").trim() === "wallet_topup") {
        return sendError(res, 410, "Wallet services are suspended. Contact support for historical payment reconciliation.");
      }
      if (payment.user_id !== user.id && profile?.role !== "admin") {
        return sendError(res, 403, "Not allowed to reconcile this payment.");
      }

      const verifyKey = typeof payment.reference === "string" && payment.reference.trim()
        ? payment.reference.trim()
        : reference;
      const verifyData = await verifyPaymentForRecord(verifyKey, payment);
      const finalized = await finalizePaymentByReference(verifyKey, verifyData);
      return res.json({
        status: "success",
        message: "Payment reconciliation completed.",
        payment_status: finalized.payment.status,
        payment_id: finalized.payment.id,
        reference: finalized.payment.reference,
        tx_ref: finalized.payment.tx_ref,
        related_order_id: finalized.payment.related_order_id || null,
        fulfilled: finalized.finalized,
        verify: verifyData,
      });
    } catch (error) {
      logPayChanguError("paychangu-reconcile-error", error, { reference, purpose: purposeHint });
      return sendError(
        res,
        statusFromError(error, getPayChanguClientStatus(error, 502)),
        getPayChanguClientErrorMessage(error, "Could not reconcile payment."),
      );
    }
  });

  app.post("/api/paychangu/webhook", async (req, res) => {
    const signature = req.header("Signature");
    const rawBody = req.rawBody || "";
    if (!verifyWebhookSignature(rawBody, signature)) {
      return sendError(res, 401, "Invalid webhook signature.");
    }

    const event = req.body;
    const summary = safeWebhookSummary(event);
    console.info("[paychangu-webhook]", JSON.stringify(summary));

    if (summary.reference) {
      try {
        const payment = await findPaymentByAnyReference(summary.reference);
        const verifyKey = payment?.reference || summary.reference;
        const verifyData = payment
          ? await verifyPaymentForRecord(String(verifyKey), payment)
          : await verifyTransaction(summary.reference);
        await finalizePaymentByReference(String(verifyKey), verifyData);
      } catch (error) {
        console.error("[paychangu-webhook-finalize-error]", error instanceof Error ? error.message : error);
      }
    }

    return res.status(200).json({ received: true });
  });
}
