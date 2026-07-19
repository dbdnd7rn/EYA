import { authenticateAppRequest } from "./security";
import {
  createPaymentIntent,
  recordPaymentProviderFailure,
  savePayChanguCheckout,
  type CreatePaymentIntentInput,
  type PaymentsEnv,
} from "./ledger";
import { initiatePayChanguCheckout, PaymentProviderError } from "./paychangu";

const PAYMENT_METHODS = new Set(["airtel_money", "mpamba", "bank_transfer"]);
const TERMINAL_PAYMENT_STATUSES = new Set(["failed", "cancelled", "expired"]);

function json(payload: unknown, status = 200, extraHeaders: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...extraHeaders,
    },
  });
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function requiredString(value: unknown, field: string, maxLength = 255): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${field} is required.`);
  }
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

function normalizeAmount(value: unknown): number {
  const amount = Number(value);
  if (!Number.isSafeInteger(amount) || amount <= 0) {
    throw new Error("amountMwk must be a positive whole number.");
  }
  return amount;
}

function parsePaymentIntentInput(appId: string, body: unknown): CreatePaymentIntentInput {
  if (!isPlainObject(body)) throw new Error("A JSON request body is required.");

  const method = requiredString(body.method, "method", 40);
  if (!PAYMENT_METHODS.has(method)) {
    throw new Error("method must be airtel_money, mpamba, or bank_transfer.");
  }

  const metadata = body.metadata == null ? {} : body.metadata;
  if (!isPlainObject(metadata)) throw new Error("metadata must be a JSON object.");

  return {
    appId,
    appPaymentId: requiredString(body.appPaymentId, "appPaymentId", 180),
    appUserId: optionalString(body.appUserId, "appUserId", 180),
    purpose: requiredString(body.purpose, "purpose", 100),
    method: method as CreatePaymentIntentInput["method"],
    amountMwk: normalizeAmount(body.amountMwk),
    customerEmail: requiredString(body.customerEmail, "customerEmail", 320).toLowerCase(),
    customerPhone: optionalString(body.customerPhone, "customerPhone", 40),
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
    checkout_configured: Boolean(
      env.PAYCHANGU_SECRET_KEY?.trim() &&
        env.PAYCHANGU_CALLBACK_URL?.trim() &&
        env.PAYCHANGU_RETURN_URL?.trim(),
    ),
    environment: env.ENVIRONMENT || "unknown",
  });
}

async function handleCreatePaymentIntent(request: Request, env: PaymentsEnv): Promise<Response> {
  validateFoundationEnvironment(env);
  const rawBody = await request.text();
  const auth = await authenticateAppRequest(request, rawBody, env.APP_SECRETS_JSON);

  let parsed: unknown;
  try {
    parsed = rawBody ? JSON.parse(rawBody) : null;
  } catch {
    return json({ status: "error", message: "Request body must contain valid JSON." }, 400);
  }

  const input = parsePaymentIntentInput(auth.appId, parsed);
  const result = await createPaymentIntent(env, input);
  let intent = result.intent;
  let checkoutCreated = false;

  if (TERMINAL_PAYMENT_STATUSES.has(intent.status)) {
    throw new Error("This payment attempt is closed. Create a new appPaymentId to try again.");
  }

  if (!intent.checkout_url) {
    try {
      const checkout = await initiatePayChanguCheckout(env, intent);
      intent = await savePayChanguCheckout(env, intent, checkout);
      checkoutCreated = true;
    } catch (error) {
      if (error instanceof PaymentProviderError) {
        await recordPaymentProviderFailure(
          env,
          intent.id,
          error.message,
          error.providerPayload,
        );
      }
      throw error;
    }
  }

  return json(
    {
      status: "success",
      created: result.created,
      checkout_created: checkoutCreated,
      payment_intent: {
        id: intent.id,
        app_id: intent.app_id,
        app_payment_id: intent.app_payment_id,
        merchant_reference: intent.merchant_reference,
        provider_reference: intent.provider_reference,
        expected_amount_mwk: intent.expected_amount_mwk,
        currency: intent.currency,
        method: intent.method,
        status: intent.status,
        checkout_url: intent.checkout_url,
        created_at: intent.created_at,
      },
    },
    result.created ? 201 : 200,
  );
}

export default {
  async fetch(request: Request, env: PaymentsEnv): Promise<Response> {
    const requestId = crypto.randomUUID();
    const url = new URL(request.url);

    try {
      if (request.method === "GET" && url.pathname === "/health") {
        return json({
          status: "ok",
          service: "vac-payments",
          environment: env.ENVIRONMENT || "unknown",
          request_id: requestId,
        });
      }

      if (request.method === "GET" && url.pathname === "/ready") {
        return await handleReadiness(env);
      }

      if (request.method === "POST" && url.pathname === "/v1/payment-intents") {
        return await handleCreatePaymentIntent(request, env);
      }

      return json({ status: "error", message: "Route not found.", request_id: requestId }, 404);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unexpected payment service error.";
      const unauthorized = /signature|signed application|unknown or inactive application|expired/i.test(message);
      const invalidRequest = /required|must be|too long|different payment request/i.test(message);
      const conflict = /payment attempt is closed|different provider checkout session|checkout session conflicts/i.test(
        message,
      );
      const providerFailure = error instanceof PaymentProviderError;
      const status = unauthorized ? 401 : conflict ? 409 : invalidRequest ? 400 : providerFailure ? 502 : 500;

      console.error("[vac-payments]", {
        requestId,
        method: request.method,
        path: url.pathname,
        message,
        providerStatusCode:
          error instanceof PaymentProviderError ? error.providerStatusCode : undefined,
      });

      return json(
        {
          status: "error",
          message:
            status === 500
              ? "Payment service could not process the request."
              : status === 502
                ? "Payment provider could not create the checkout session."
                : message,
          request_id: requestId,
        },
        status,
      );
    }
  },
};
