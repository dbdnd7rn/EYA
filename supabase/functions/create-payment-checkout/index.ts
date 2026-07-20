import "@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "@supabase/server";

const encoder = new TextEncoder();
const PAYMENT_METHODS = new Set(["airtel_money", "mpamba", "bank_transfer"]);
const WORKER_PATH = "/v1/payment-intents";
const REQUEST_TIMEOUT_MS = 15_000;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...corsHeaders,
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
  if (typeof value !== "string" || !value.trim()) throw new Error(`${field} is required.`);
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

function normalizeQuantity(value: unknown): number {
  const quantity = Number(value);
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 10) {
    throw new Error("quantity must be between 1 and 10.");
  }
  return quantity;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
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

function asObject(value: unknown): Record<string, unknown> {
  return isPlainObject(value) ? value : {};
}

async function createVacCheckout(payload: Record<string, unknown>): Promise<Record<string, unknown>> {
  const workerBase = Deno.env.get("VAC_PAYMENTS_URL")?.trim().replace(/\/+$/, "");
  const secret = Deno.env.get("VAC_PAYMENT_CALLBACK_SECRET")?.trim();

  if (!workerBase) throw new Error("VAC payments URL is not configured.");
  if (!secret || secret.length < 32) throw new Error("VAC payment application secret is not configured.");

  const workerUrl = new URL(`${workerBase}${WORKER_PATH}`);
  if (workerUrl.protocol !== "https:") throw new Error("VAC payments URL must use HTTPS.");

  const rawBody = JSON.stringify(payload);
  const timestamp = Math.floor(Date.now() / 1000);
  const canonical = [String(timestamp), "POST", WORKER_PATH, rawBody].join(".");
  const signature = await hmacSha256Hex(secret, canonical);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(workerUrl, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "x-vac-app-id": "eya",
        "x-vac-timestamp": String(timestamp),
        "x-vac-signature": signature,
      },
      body: rawBody,
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error("VAC payments checkout request timed out.");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }

  const responsePayload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = isPlainObject(responsePayload) && typeof responsePayload.message === "string"
      ? responsePayload.message
      : `VAC payments returned HTTP ${response.status}.`;
    throw new Error(message);
  }
  if (!isPlainObject(responsePayload)) throw new Error("VAC payments returned an invalid response.");

  const paymentIntent = asObject(responsePayload.payment_intent);
  const checkoutUrl = requiredString(paymentIntent.checkout_url, "checkout_url", 2000);
  const parsedCheckoutUrl = new URL(checkoutUrl);
  if (parsedCheckoutUrl.protocol !== "https:") throw new Error("VAC checkout URL must use HTTPS.");

  return responsePayload;
}

export default {
  fetch: withSupabase({ auth: "user" }, async (request, ctx) => {
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
    if (request.method !== "POST") return json({ status: "error", message: "Method not allowed." }, 405);

    let reservedOrderId: string | null = null;
    let checkoutCreated = false;

    try {
      const body: unknown = await request.json().catch(() => null);
      if (!isPlainObject(body)) return json({ status: "error", message: "A JSON request body is required." }, 400);

      const eventId = requiredString(body.event_id ?? body.eventId, "event_id", 100);
      const tierId = requiredString(body.tier_id ?? body.tierId, "tier_id", 100);
      const quantity = normalizeQuantity(body.quantity);
      const paymentMethod = requiredString(body.payment_method ?? body.paymentMethod, "payment_method", 40);
      const phone = optionalString(body.phone, "phone", 40);

      if (!PAYMENT_METHODS.has(paymentMethod)) {
        throw new Error("payment_method must be airtel_money, mpamba, or bank_transfer.");
      }
      if ((paymentMethod === "airtel_money" || paymentMethod === "mpamba") && (!phone || phone.replace(/\D/g, "").length < 8)) {
        throw new Error("A valid mobile money phone number is required.");
      }

      const { data: authData, error: authError } = await ctx.supabase.auth.getUser();
      if (authError || !authData.user?.id) throw new Error("Invalid authenticated session.");
      if (!authData.user.email) throw new Error("Your account needs an email before buying tickets.");

      const { data: reservationData, error: reservationError } = await ctx.supabaseAdmin.rpc(
        "reserve_ticket_order",
        {
          p_user_id: authData.user.id,
          p_event_id: eventId,
          p_tier_id: tierId,
          p_quantity: quantity,
          p_customer_email: authData.user.email,
          p_customer_phone: phone,
        },
      );
      if (reservationError) throw new Error(reservationError.message);

      const reservation = asObject(reservationData);
      const order = asObject(reservation.order);
      const event = asObject(reservation.event);
      const tier = asObject(reservation.tier);
      reservedOrderId = requiredString(order.id, "ticket order id", 100);
      const totalMwk = Number(order.total_mwk);
      if (!Number.isSafeInteger(totalMwk) || totalMwk <= 0) throw new Error("Ticket order total is invalid.");

      const vacResponse = await createVacCheckout({
        appPaymentId: reservedOrderId,
        appUserId: authData.user.id,
        purpose: "ticket_order",
        method: paymentMethod,
        amountMwk: totalMwk,
        customerEmail: authData.user.email,
        customerPhone: phone,
        title: `EYA ticket - ${String(event.title || "Event")}`,
        description: `${quantity} x ${String(tier.name || "Ticket")} for ${String(event.title || "event")}`,
        metadata: {
          ticket_order_id: reservedOrderId,
          related_order_id: reservedOrderId,
          user_id: authData.user.id,
          event_id: eventId,
          tier_id: tierId,
          quantity,
          payment_method: paymentMethod,
        },
      });
      checkoutCreated = true;

      const paymentIntent = asObject(vacResponse.payment_intent);
      const merchantReference = requiredString(paymentIntent.merchant_reference, "merchant_reference", 300);
      const checkoutUrl = requiredString(paymentIntent.checkout_url, "checkout_url", 2000);

      const { error: orderUpdateError } = await ctx.supabaseAdmin
        .from("ticket_orders")
        .update({
          status: "awaiting_payment",
          payment_status: "pending",
          payment_reference: merchantReference,
          customer_phone: phone,
          updated_at: new Date().toISOString(),
        })
        .eq("id", reservedOrderId)
        .eq("user_id", authData.user.id);
      if (orderUpdateError) throw new Error(orderUpdateError.message);

      const { error: ticketPaymentError } = await ctx.supabaseAdmin
        .from("ticket_payments")
        .upsert(
          {
            order_id: reservedOrderId,
            payment_id: null,
            provider: "paychangu",
            method: paymentMethod,
            reference: merchantReference,
            amount_mwk: totalMwk,
            status: "pending",
            provider_payload: vacResponse,
          },
          { onConflict: "order_id,reference" },
        );
      if (ticketPaymentError) throw new Error(ticketPaymentError.message);

      return json({
        status: "success",
        message: "Ticket reservation created. Complete payment to issue tickets.",
        order: { ...order, status: "awaiting_payment", payment_status: "pending", payment_reference: merchantReference },
        event,
        tier,
        payment_id: "",
        tx_ref: merchantReference,
        checkout_url: checkoutUrl,
        direct_charge: {
          status: String(paymentIntent.status || "pending"),
          provider_reference: paymentIntent.provider_reference ?? null,
          payment_account_details: null,
          authorization: null,
        },
      }, 201);
    } catch (error) {
      if (reservedOrderId && !checkoutCreated) {
        await ctx.supabaseAdmin.rpc("release_ticket_order", {
          p_order_id: reservedOrderId,
          p_status: "failed",
        }).catch(() => undefined);
      }

      const message = error instanceof Error ? error.message : "Could not create ticket checkout.";
      const unauthorized = /authenticated session|login|authorization/i.test(message);
      const invalidRequest = /required|invalid|must be|between 1 and 10|not available|sales|tickets are available/i.test(message);
      const status = unauthorized ? 401 : invalidRequest ? 400 : 502;
      console.error("[create-payment-checkout]", { status, message, reservedOrderId, checkoutCreated });
      return json({ status: "error", message }, status);
    }
  }),
};
