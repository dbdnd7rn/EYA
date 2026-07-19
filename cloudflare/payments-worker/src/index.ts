import { authenticateAppRequest } from "./security";
import {
  createPaymentIntent,
  type CreatePaymentIntentInput,
  type PaymentsEnv,
} from "./ledger";

const PAYMENT_METHODS = new Set(["airtel_money", "mpamba", "bank_transfer"]);

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

function validateEnvironment(env: PaymentsEnv): void {
  const missing: string[] = [];
  if (!env.PAYMENTS_SUPABASE_URL) missing.push("PAYMENTS_SUPABASE_URL");
  if (!env.PAYMENTS_SUPABASE_SERVICE_ROLE_KEY) missing.push("PAYMENTS_SUPABASE_SERVICE_ROLE_KEY");
  if (!env.APP_SECRETS_JSON) missing.push("APP_SECRETS_JSON");
  if (missing.length) throw new Error(`Missing Worker secrets: ${missing.join(", ")}.`);
}

async function handleCreatePaymentIntent(request: Request, env: PaymentsEnv): Promise<Response> {
  validateEnvironment(env);
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

  return json(
    {
      status: "success",
      created: result.created,
      payment_intent: {
        id: result.intent.id,
        app_id: result.intent.app_id,
        app_payment_id: result.intent.app_payment_id,
        merchant_reference: result.intent.merchant_reference,
        expected_amount_mwk: result.intent.expected_amount_mwk,
        currency: result.intent.currency,
        method: result.intent.method,
        status: result.intent.status,
        created_at: result.intent.created_at,
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

      if (request.method === "POST" && url.pathname === "/v1/payment-intents") {
        return await handleCreatePaymentIntent(request, env);
      }

      return json({ status: "error", message: "Route not found.", request_id: requestId }, 404);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unexpected payment service error.";
      const unauthorized = /signature|signed application|unknown or inactive application|expired/i.test(message);
      const invalidRequest = /required|must be|too long|different payment request/i.test(message);
      const status = unauthorized ? 401 : invalidRequest ? 400 : 500;

      console.error("[vac-payments]", {
        requestId,
        method: request.method,
        path: url.pathname,
        message,
      });

      return json(
        {
          status: "error",
          message: status === 500 ? "Payment service could not process the request." : message,
          request_id: requestId,
        },
        status,
      );
    }
  },
};
