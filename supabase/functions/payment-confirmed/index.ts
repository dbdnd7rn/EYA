import "@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "@supabase/server";

const MAX_CLOCK_SKEW_SECONDS = 300;
const MAX_BODY_BYTES = 64 * 1024;
const encoder = new TextEncoder();

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function requiredString(value: unknown, field: string, maxLength = 300): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${field} is required.`);
  }

  const normalized = value.trim();
  if (normalized.length > maxLength) throw new Error(`${field} is too long.`);
  return normalized;
}

function optionalString(value: unknown, field: string, maxLength = 300): string | null {
  if (value == null || value === "") return null;
  if (typeof value !== "string") throw new Error(`${field} must be a string.`);

  const normalized = value.trim();
  if (normalized.length > maxLength) throw new Error(`${field} is too long.`);
  return normalized || null;
}

function normalizeAmount(value: unknown): number {
  const amount = Number(value);
  if (!Number.isSafeInteger(amount) || amount <= 0) {
    throw new Error("amount_mwk must be a positive whole number.");
  }
  return amount;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
}

function constantTimeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;

  let mismatch = 0;
  for (let index = 0; index < left.length; index += 1) {
    mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return mismatch === 0;
}

async function hmacSha256Hex(secret: string, value: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );

  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(value));
  return bytesToHex(new Uint8Array(signature));
}

async function authenticateVacCallback(request: Request, rawBody: string): Promise<void> {
  const appId = (request.headers.get("x-vac-app-id") || "").trim();
  const timestampRaw = (request.headers.get("x-vac-timestamp") || "").trim();
  const suppliedSignature = (request.headers.get("x-vac-signature") || "")
    .trim()
    .toLowerCase()
    .replace(/^sha256=/, "");

  if (appId !== "eya" || !timestampRaw || !suppliedSignature) {
    throw new Error("Missing or invalid VAC callback authentication headers.");
  }

  const timestamp = Number(timestampRaw);
  if (!Number.isInteger(timestamp)) throw new Error("Invalid VAC callback timestamp.");

  const nowSeconds = Math.floor(Date.now() / 1000);
  if (Math.abs(nowSeconds - timestamp) > MAX_CLOCK_SKEW_SECONDS) {
    throw new Error("VAC callback request has expired.");
  }

  if (!/^[0-9a-f]{64}$/.test(suppliedSignature)) {
    throw new Error("Invalid VAC callback signature format.");
  }

  const secret = Deno.env.get("VAC_PAYMENT_CALLBACK_SECRET")?.trim();
  if (!secret || secret.length < 32) {
    throw new Error("VAC payment callback secret is not configured.");
  }

  const path = new URL(request.url).pathname;
  const canonical = [String(timestamp), request.method.toUpperCase(), path, rawBody].join(".");
  const expectedSignature = await hmacSha256Hex(secret, canonical);

  if (!constantTimeEqual(expectedSignature, suppliedSignature)) {
    throw new Error("Invalid VAC callback signature.");
  }
}

export default {
  fetch: withSupabase({ auth: "none" }, async (request, ctx) => {
    if (request.method !== "POST") {
      return json({ status: "error", message: "Method not allowed." }, 405);
    }

    try {
      const rawBody = await request.text();
      if (encoder.encode(rawBody).byteLength > MAX_BODY_BYTES) {
        return json({ status: "error", message: "Request body is too large." }, 413);
      }

      await authenticateVacCallback(request, rawBody);

      let payload: unknown;
      try {
        payload = rawBody ? JSON.parse(rawBody) : null;
      } catch {
        return json({ status: "error", message: "Request body must contain valid JSON." }, 400);
      }

      if (!isPlainObject(payload)) {
        return json({ status: "error", message: "Payment event must be a JSON object." }, 400);
      }

      const idempotencyKey = requiredString(
        request.headers.get("x-vac-idempotency-key"),
        "x-vac-idempotency-key",
        400,
      );
      const eventType = requiredString(payload.event, "event", 80);
      const appId = requiredString(payload.app_id, "app_id", 80);
      const currency = requiredString(payload.currency, "currency", 10);

      if (eventType !== "payment.paid") throw new Error("Unsupported payment event type.");
      if (appId !== "eya") throw new Error("Invalid payment application id.");
      if (currency !== "MWK") throw new Error("Invalid payment currency.");

      const verifiedAt = requiredString(payload.verified_at, "verified_at", 80);
      const verifiedDate = new Date(verifiedAt);
      if (Number.isNaN(verifiedDate.getTime())) throw new Error("verified_at is invalid.");

      const metadata = payload.metadata == null ? {} : payload.metadata;
      if (!isPlainObject(metadata)) throw new Error("metadata must be a JSON object.");

      const rpcPayload = {
        p_idempotency_key: idempotencyKey,
        p_event_type: eventType,
        p_payment_intent_id: requiredString(payload.payment_intent_id, "payment_intent_id", 200),
        p_app_id: appId,
        p_app_payment_id: requiredString(payload.app_payment_id, "app_payment_id", 200),
        p_app_user_id: optionalString(payload.app_user_id, "app_user_id", 200),
        p_purpose: requiredString(payload.purpose, "purpose", 120),
        p_merchant_reference: requiredString(payload.merchant_reference, "merchant_reference", 250),
        p_amount_mwk: normalizeAmount(payload.amount_mwk),
        p_currency: currency,
        p_verified_at: verifiedDate.toISOString(),
        p_metadata: metadata,
        p_payload: payload,
      };

      const { data, error } = await ctx.supabaseAdmin.rpc("process_vac_payment_event", rpcPayload);
      if (error) {
        console.error("[payment-confirmed] failed to process VAC payment event", {
          code: error.code,
          message: error.message,
        });
        return json({ status: "error", message: "EYA could not process the payment event." }, 500);
      }

      const row = Array.isArray(data) ? data[0] : data;
      const inserted = Boolean(row?.inserted);
      const fulfilled = row?.fulfilled === true;

      return json({
        status: "accepted",
        duplicate: !inserted,
        event_id: row?.event_id || null,
        event_status: row?.current_status || "processed",
        fulfilled,
        fulfilment: isPlainObject(row?.fulfilment) ? row.fulfilment : {},
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unexpected payment callback error.";
      const unauthorized = /authentication|signature|expired|secret is not configured/i.test(message);
      const invalidRequest = /required|too long|must be|unsupported|invalid payment|verified_at/i.test(message);
      const status = unauthorized ? 401 : invalidRequest ? 400 : 500;

      console.error("[payment-confirmed]", { status, message });
      return json(
        {
          status: "error",
          message: status === 500 ? "EYA could not process the payment callback." : message,
        },
        status,
      );
    }
  }),
};
