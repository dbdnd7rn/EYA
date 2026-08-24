import { authenticateAppRequest } from "./security";
import { enforceRateLimit, readBoundedBody } from "./abuse-protection";
import {
  createPaymentIntent,
  recordPaymentProviderFailure,
  savePayChanguCheckout,
  savePayChanguDirectCharge,
  type CreatePaymentIntentInput,
  type PaymentCurrency,
  type PaymentsEnv,
} from "./ledger";
import { initiatePayChanguCheckout, PaymentProviderError } from "./paychangu";
import { initiatePayChanguDirectCharge, readDirectChargePresentation } from "./paychangu-direct";
import {
  createWebhookEventKey,
  extractPayChanguReference,
  verifyPayChanguWebhookSignature,
} from "./paychangu-verification";
import { createOrLoadWebhookEvent, updateWebhookEvent } from "./verification-ledger";
import {
  PaymentIntentNotFoundError,
  PaymentVerificationMismatchError,
  verifyAndRecordPayChanguPayment,
} from "./processing";
import { paymentResultPage as html } from "./payment-page";
import { deliverDueOutboxEvents } from "./outbox-delivery";
import { verifyDuePendingPayments } from "./pending-verification";

const PAYMENT_METHODS = new Set(["airtel_money", "mpamba", "bank_transfer", "card", "hosted_checkout"]);
const DIRECT_METHODS = new Set(["airtel_money", "mpamba", "bank_transfer"]);
const HOSTED_METHODS = new Set(["card", "hosted_checkout"]);
const TERMINAL_PAYMENT_STATUSES = new Set(["failed", "cancelled", "expired"]);

type WorkerExecutionContextLike = { waitUntil(promise: Promise<unknown>): void };
type ScheduledControllerLike = { cron: string; scheduledTime: number };

function json(payload: unknown, status = 200, extraHeaders: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      ...extraHeaders,
    },
  });
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function requiredString(value: unknown, field: string, maxLength = 255): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${field} is required.`);
  const normalized = value.trim();
  if (normalized.length > maxLength) throw new Error(`${field} is too long.`);
  return normalized;
}

function optionalString(value: unknown, field: string, maxLength = 500): string | null {
  if (value == null || value === "") return null;
  if (typeof value !== "string") throw new Error(`${field} must be a string.`);
  const normalized = value.trim();
  if (normalized.length > maxLength) throw new Error(`${field} is too long.`);
  return normalized || null;
}

function normalizePositiveInteger(value: unknown, field: string): number {
  const amount = Number(value);
  if (!Number.isSafeInteger(amount) || amount <= 0) throw new Error(`${field} must be a positive whole number.`);
  return amount;
}

function normalizeCurrency(value: unknown, hasLegacyAmountMwk: boolean): PaymentCurrency {
  const normalized = String(value || (hasLegacyAmountMwk ? "MWK" : "")).trim().toUpperCase();
  if (normalized === "MK" || normalized === "MWK") return "MWK";
  if (normalized === "USD") return "USD";
  throw new Error("currency must be MWK or USD.");
}

function normalizePhone(value: string | null): string | null {
  if (!value) return null;
  const digits = value.replace(/\D/g, "");
  const local = digits.startsWith("265") ? digits.slice(3) : digits.startsWith("0") ? digits.slice(1) : digits;
  if (!/^[89]\d{8}$/.test(local)) throw new Error("customerPhone must be a valid Malawi number.");
  return `+265${local}`;
}

function parsePaymentIntentInput(appId: string, body: unknown): CreatePaymentIntentInput {
  if (!isPlainObject(body)) throw new Error("A JSON request body is required.");
  const method = requiredString(body.method, "method", 40);
  if (!PAYMENT_METHODS.has(method)) {
    throw new Error("method must be airtel_money, mpamba, bank_transfer, card, or hosted_checkout.");
  }

  const hasLegacyAmountMwk = body.amountMwk != null;
  const currency = normalizeCurrency(body.currency, hasLegacyAmountMwk);
  const amountMinor = body.amountMinor != null
    ? normalizePositiveInteger(body.amountMinor, "amountMinor")
    : normalizePositiveInteger(body.amountMwk, "amountMwk");

  if (DIRECT_METHODS.has(method) && currency !== "MWK") {
    throw new Error("Direct Airtel Money, Mpamba, and bank-transfer payments require MWK.");
  }

  const metadata = body.metadata == null ? {} : body.metadata;
  if (!isPlainObject(metadata)) throw new Error("metadata must be a JSON object.");
  const customerPhone = normalizePhone(optionalString(body.customerPhone, "customerPhone", 40));
  if ((method === "airtel_money" || method === "mpamba") && !customerPhone) {
    throw new Error("customerPhone is required for mobile money.");
  }

  return {
    appId,
    appPaymentId: requiredString(body.appPaymentId, "appPaymentId", 180),
    appUserId: optionalString(body.appUserId, "appUserId", 180),
    purpose: requiredString(body.purpose, "purpose", 100),
    method: method as CreatePaymentIntentInput["method"],
    currency,
    amountMinor,
    customerEmail: requiredString(body.customerEmail, "customerEmail", 320).toLowerCase(),
    customerPhone,
    title: optionalString(body.title, "title", 160),
    description: optionalString(body.description, "description", 500),
    metadata,
  };
}

function validateFoundationEnvironment(env: PaymentsEnv): void {
  const missing: string[] = [];
  if (!env.PAYMENTS_DB) missing.push("PAYMENTS_DB D1 binding");
  if (!env.APP_SECRETS_JSON) missing.push("APP_SECRETS_JSON");
  if (missing.length) throw new Error(`Missing Worker configuration: ${missing.join(", ")}.`);
}

async function handleReadiness(env: PaymentsEnv): Promise<Response> {
  validateFoundationEnvironment(env);
  const row = await env.PAYMENTS_DB.prepare("select 1 as ok").first<{ ok: number }>();
  if (Number(row?.ok) !== 1) throw new Error("D1 readiness check failed.");
  return json({
    status: "ready",
    service: "vac-payments",
    ledger: "d1",
    hosted_checkout_configured: Boolean(
      env.PAYCHANGU_SECRET_KEY?.trim() && env.PAYCHANGU_CALLBACK_URL?.trim() && env.PAYCHANGU_RETURN_URL?.trim(),
    ),
    hosted_checkout_currencies: ["MWK", "USD"],
    direct_charge_configured: Boolean(env.PAYCHANGU_SECRET_KEY?.trim()),
    webhook_configured: Boolean(env.PAYCHANGU_WEBHOOK_SECRET?.trim()),
    callbacks_configured: Boolean(env.APP_CALLBACKS_JSON?.trim()),
    environment: env.ENVIRONMENT || "unknown",
  });
}

function scheduleInitialVerification(
  env: PaymentsEnv,
  reference: string,
  context?: WorkerExecutionContextLike,
): void {
  if (!context) return;
  context.waitUntil(
    new Promise<void>((resolve) => setTimeout(resolve, 4_000))
      .then(async () => {
        const result = await verifyAndRecordPayChanguPayment(env, reference);
        if (result.intent.status === "paid") {
          await deliverDueOutboxEvents(env, 10);
        }
      })
      .catch((error) => {
        console.error("[vac-payments] initial direct-charge verification failed", {
          reference,
          message: error instanceof Error ? error.message : "Unknown verification error.",
        });
      }),
  );
}

async function handleCreatePaymentIntent(
  request: Request,
  env: PaymentsEnv,
  context?: WorkerExecutionContextLike,
): Promise<Response> {
  validateFoundationEnvironment(env);
  const rawBody = await readBoundedBody(request);
  const auth = await authenticateAppRequest(request, rawBody, env.APP_SECRETS_JSON, env.PAYMENTS_DB);
  let parsed: unknown;
  try {
    parsed = rawBody ? JSON.parse(rawBody) : null;
  } catch {
    return json({ status: "error", message: "Request body must contain valid JSON." }, 400);
  }

  const input = parsePaymentIntentInput(auth.appId, parsed);
  const result = await createPaymentIntent(env, input);
  let intent = result.intent;
  let providerSessionCreated = false;

  if (TERMINAL_PAYMENT_STATUSES.has(intent.status)) {
    throw new Error("This payment attempt is closed. Create a new appPaymentId to try again.");
  }

  try {
    if (HOSTED_METHODS.has(intent.method)) {
      if (!intent.checkout_url) {
        const checkout = await initiatePayChanguCheckout(env, intent);
        intent = await savePayChanguCheckout(env, intent, checkout);
        providerSessionCreated = true;
      }
    } else if (!intent.provider_reference) {
      const charge = await initiatePayChanguDirectCharge(env, intent);
      intent = await savePayChanguDirectCharge(env, intent, charge);
      providerSessionCreated = true;
    }
  } catch (error) {
    if (error instanceof PaymentProviderError) {
      await recordPaymentProviderFailure(env, intent.id, error.message, error.providerPayload);
    }
    throw error;
  }

  if (DIRECT_METHODS.has(intent.method) && intent.provider_reference) {
    scheduleInitialVerification(env, intent.merchant_reference, context);
  }

  const presentation = readDirectChargePresentation(intent.method, intent.provider_payload);
  return json(
    {
      status: "success",
      created: result.created,
      provider_session_created: providerSessionCreated,
      payment_intent: {
        id: intent.id,
        app_id: intent.app_id,
        app_payment_id: intent.app_payment_id,
        merchant_reference: intent.merchant_reference,
        provider_reference: intent.provider_reference,
        expected_amount_minor: intent.expected_amount_minor,
        expected_amount_mwk: intent.currency === "MWK" ? intent.expected_amount_minor : null,
        currency: intent.currency,
        method: intent.method,
        status: intent.status,
        checkout_url: intent.checkout_url,
        direct_charge: {
          status: intent.status,
          provider_reference: intent.provider_reference,
          payment_account_details: presentation.paymentAccountDetails,
          authorization: presentation.authorization,
        },
        created_at: intent.created_at,
      },
    },
    result.created ? 201 : 200,
  );
}

async function readPublicReference(request: Request, url: URL): Promise<string | null> {
  const fromQuery = url.searchParams.get("tx_ref")?.trim() || url.searchParams.get("charge_id")?.trim();
  if (fromQuery) return fromQuery;
  if (request.method === "GET" || request.method === "HEAD") return null;
  const rawBody = await readBoundedBody(request);
  if (!rawBody.trim()) return null;
  const contentType = request.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    try {
      const parsed: unknown = JSON.parse(rawBody);
      return extractPayChanguReference(parsed);
    } catch {
      return null;
    }
  }
  const form = new URLSearchParams(rawBody);
  return form.get("tx_ref")?.trim() || form.get("charge_id")?.trim() || null;
}

function applicationLabel(appId: string): string {
  if (appId === "online-tourism") return "Online Tourism";
  if (appId === "eya") return "EYA";
  return "the application";
}

function paymentStatusPage(status: string, appId: string): Response {
  const appLabel = applicationLabel(appId);
  if (status === "paid") return html("Payment confirmed", `Your payment was verified successfully. You may return to ${appLabel}.`);
  if (status === "failed" || status === "cancelled" || status === "expired") {
    return html("Payment not completed", `No payment was confirmed. You may return to ${appLabel} and try again.`);
  }
  return html("Payment verification pending", `Your payment is still being verified. You may return to ${appLabel}; access will update after confirmation.`);
}

async function handlePublicPaymentResult(request: Request, env: PaymentsEnv): Promise<Response> {
  validateFoundationEnvironment(env);
  const reference = await readPublicReference(request, new URL(request.url));
  if (!reference) return html("Invalid payment response", "The transaction reference is missing.", 400);
  try {
    const result = await verifyAndRecordPayChanguPayment(env, reference);
    return paymentStatusPage(result.intent.status, result.intent.app_id);
  } catch (error) {
    if (error instanceof PaymentIntentNotFoundError) return html("Payment not found", "This payment reference is not recognized.", 404);
    if (error instanceof PaymentVerificationMismatchError) {
      console.error("[vac-payments] payment verification mismatch", { reference, message: error.message });
      return html("Payment requires review", "The payment could not be confirmed automatically. No access has been granted.", 409);
    }
    if (error instanceof PaymentProviderError) {
      console.error("[vac-payments] provider verification unavailable", { reference, providerStatusCode: error.providerStatusCode });
      return html("Verification temporarily unavailable", "Your payment has not been lost. Please return to the application while verification continues.", 200);
    }
    throw error;
  }
}

async function handlePayChanguWebhook(request: Request, env: PaymentsEnv): Promise<Response> {
  validateFoundationEnvironment(env);
  const rawBody = await readBoundedBody(request);
  const signatureValid = await verifyPayChanguWebhookSignature(rawBody, request.headers.get("Signature"), env.PAYCHANGU_WEBHOOK_SECRET);
  if (!signatureValid) return json({ status: "error", message: "Invalid PayChangu webhook signature." }, 401);

  let payload: unknown;
  try {
    payload = rawBody ? JSON.parse(rawBody) : null;
  } catch {
    return json({ status: "error", message: "Webhook body must contain valid JSON." }, 400);
  }
  if (!isPlainObject(payload)) return json({ status: "error", message: "Webhook body must be a JSON object." }, 400);

  const eventKey = await createWebhookEventKey(rawBody);
  const stored = await createOrLoadWebhookEvent(env, eventKey, payload);
  const event = stored.event;
  if (["processed", "ignored", "processing"].includes(event.status)) return json({ status: "success", duplicate: true }, 200);

  const reference = extractPayChanguReference(payload);
  if (!reference) {
    await updateWebhookEvent(env, event.id, "ignored", null, "Webhook did not include tx_ref or charge_id.");
    return json({ status: "success", ignored: true }, 200);
  }

  await updateWebhookEvent(env, event.id, "processing", null, null);
  try {
    const result = await verifyAndRecordPayChanguPayment(env, reference);
    await updateWebhookEvent(env, event.id, "processed", result.intent.id, null);
    return json({ status: "success", payment_status: result.intent.status }, 200);
  } catch (error) {
    if (error instanceof PaymentIntentNotFoundError) {
      await updateWebhookEvent(env, event.id, "ignored", null, error.message);
      return json({ status: "success", ignored: true }, 200);
    }
    if (error instanceof PaymentVerificationMismatchError) {
      await updateWebhookEvent(env, event.id, "failed", null, error.message);
      console.error("[vac-payments] webhook verification mismatch", { reference, message: error.message });
      return json({ status: "success", accepted: false }, 200);
    }
    await updateWebhookEvent(env, event.id, "failed", null, error instanceof Error ? error.message : "Webhook processing failed.");
    throw error;
  }
}

async function handleDeliverOutbox(request: Request, env: PaymentsEnv): Promise<Response> {
  validateFoundationEnvironment(env);
  const rawBody = await readBoundedBody(request);
  const auth = await authenticateAppRequest(request, rawBody, env.APP_SECRETS_JSON, env.PAYMENTS_DB);
  if (auth.appId !== "eya") throw new Error("Only EYA may trigger this outbox delivery endpoint.");
  let limit = 10;
  if (rawBody.trim()) {
    let payload: unknown;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      return json({ status: "error", message: "Request body must contain valid JSON." }, 400);
    }
    if (!isPlainObject(payload)) return json({ status: "error", message: "Request body must be a JSON object." }, 400);
    if (payload.limit != null) {
      const requestedLimit = Number(payload.limit);
      if (!Number.isSafeInteger(requestedLimit) || requestedLimit < 1 || requestedLimit > 10) {
        throw new Error("limit must be a whole number from 1 to 10.");
      }
      limit = requestedLimit;
    }
  }
  return json({ status: "success", ...(await deliverDueOutboxEvents(env, limit)) });
}

function scheduleOutboxDelivery(env: PaymentsEnv, context?: WorkerExecutionContextLike): void {
  if (!context || !env.APP_CALLBACKS_JSON?.trim()) return;
  context.waitUntil(
    deliverDueOutboxEvents(env)
      .then((summary) => {
        if (summary.attempted > 0) console.log("[vac-payments] background outbox delivery", summary);
      })
      .catch((error) => console.error("[vac-payments] background outbox delivery failed", { message: error instanceof Error ? error.message : "Unknown background delivery error." })),
  );
}

export default {
  async fetch(request: Request, env: PaymentsEnv, context?: WorkerExecutionContextLike): Promise<Response> {
    const requestId = crypto.randomUUID();
    const url = new URL(request.url);
    try {
      if (request.method === "GET" && url.pathname === "/health") return json({ status: "ok", service: "vac-payments", environment: env.ENVIRONMENT || "unknown", request_id: requestId });
      if (request.method === "GET" && url.pathname === "/ready") return await handleReadiness(env);
      if (url.pathname === "/v1/payment-intents") await enforceRateLimit(request, env, "payment-intents", 30);
      if (url.pathname === "/v1/paychangu/callback" || url.pathname === "/v1/paychangu/return") {
        await enforceRateLimit(request, env, "public-payment-result", 30);
      }
      if (url.pathname === "/v1/webhooks/paychangu") await enforceRateLimit(request, env, "paychangu-webhook", 120);
      if (url.pathname === "/v1/outbox/deliver") await enforceRateLimit(request, env, "outbox-deliver", 10);
      if (request.method === "POST" && url.pathname === "/v1/payment-intents") return await handleCreatePaymentIntent(request, env, context);
      if ((request.method === "GET" || request.method === "POST") && (url.pathname === "/v1/paychangu/callback" || url.pathname === "/v1/paychangu/return")) {
        const response = await handlePublicPaymentResult(request, env);
        scheduleOutboxDelivery(env, context);
        return response;
      }
      if (request.method === "POST" && url.pathname === "/v1/webhooks/paychangu") {
        const response = await handlePayChanguWebhook(request, env);
        scheduleOutboxDelivery(env, context);
        return response;
      }
      if (request.method === "POST" && url.pathname === "/v1/outbox/deliver") return await handleDeliverOutbox(request, env);
      return json({ status: "error", message: "Route not found.", request_id: requestId }, 404);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unexpected payment service error.";
      const unauthorized = /signature|signed application|unknown or inactive application|expired|nonce|request timestamp|only eya/i.test(message);
      const rateLimited = /rate limit exceeded/i.test(message);
      const tooLarge = /request body is too large/i.test(message);
      const invalidRequest = /required|must be|too long|different payment request|limit must be|valid malawi|require mwk/i.test(message);
      const conflict = /payment attempt is closed|different provider|session conflicts|cannot transition/i.test(message);
      const notFound = error instanceof PaymentIntentNotFoundError;
      const mismatch = error instanceof PaymentVerificationMismatchError;
      const providerFailure = error instanceof PaymentProviderError;
      const status = rateLimited ? 429 : tooLarge ? 413 : unauthorized ? 401 : notFound ? 404 : conflict || mismatch ? 409 : invalidRequest ? 400 : providerFailure ? 502 : 500;
      console.error("[vac-payments]", {
        requestId,
        method: request.method,
        path: url.pathname,
        message,
        providerStatusCode: error instanceof PaymentProviderError ? error.providerStatusCode : undefined,
      });
      return json({
        status: "error",
        message: status === 500 ? "Payment service could not process the request." : status === 502 ? "Payment provider is temporarily unavailable." : message,
        request_id: requestId,
      }, status);
    }
  },

  async scheduled(controller: ScheduledControllerLike, env: PaymentsEnv, context: WorkerExecutionContextLike): Promise<void> {
    context.waitUntil(
      verifyDuePendingPayments(env, 10)
        .then(async (verification) => {
          const outbox = await deliverDueOutboxEvents(env);
          console.log("[vac-payments] scheduled payment maintenance", {
            cron: controller.cron,
            scheduledTime: controller.scheduledTime,
            verification,
            outbox,
          });
        })
        .catch((error) => console.error("[vac-payments] scheduled payment maintenance failed", {
          cron: controller.cron,
          scheduledTime: controller.scheduledTime,
          message: error instanceof Error ? error.message : "Unknown scheduled payment error.",
        })),
    );
  },
};
