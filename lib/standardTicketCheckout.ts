import { ENV } from "@/lib/env";

const REQUEST_TIMEOUT_MS = 15_000;
const PAYCHANGU_CHECKOUT_HOST = "checkout.paychangu.com";

export type StandardTicketCheckoutInput = {
  eventId: string;
  tierId: string;
  quantity: number;
};

export type StandardTicketCheckoutSession = {
  order: {
    id: string;
    totalMwk: number;
    quantity: number;
  };
  checkoutUrl: string;
  txRef: string;
  paymentIntentId: string;
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function requiredString(value: unknown, field: string, maxLength = 2000): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${field} is missing.`);
  const normalized = value.trim();
  if (normalized.length > maxLength) throw new Error(`${field} is too long.`);
  return normalized;
}

function parseError(payload: unknown): string | null {
  if (!isPlainObject(payload)) return null;
  const value = payload.message ?? payload.error ?? payload.detail;
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function isTrustedPayChanguCheckoutUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      url.hostname.toLowerCase() === PAYCHANGU_CHECKOUT_HOST
    );
  } catch {
    return false;
  }
}

function validateIdentifier(value: string, field: string): string {
  const normalized = value.trim();
  if (!normalized || normalized.length > 100 || !/^[a-zA-Z0-9_-]+$/.test(normalized)) {
    throw new Error(`${field} is invalid.`);
  }
  return normalized;
}

export async function createStandardTicketCheckout(
  accessToken: string,
  input: StandardTicketCheckoutInput,
): Promise<StandardTicketCheckoutSession> {
  if (!accessToken.trim()) throw new Error("Your login session is unavailable. Please sign in again.");

  const eventId = validateIdentifier(input.eventId, "Event");
  const tierId = validateIdentifier(input.tierId, "Ticket type");
  const quantity = Number(input.quantity);
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 10) {
    throw new Error("Ticket quantity must be between 1 and 10.");
  }

  const endpoint = `${ENV.SUPABASE_URL.replace(/\/+$/, "")}/functions/v1/create-payment-checkout`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: {
        apikey: ENV.SUPABASE_ANON_KEY,
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        event_id: eventId,
        tier_id: tierId,
        quantity,
        payment_method: "standard_checkout",
      }),
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("The secure checkout request timed out. Please try again.");
    }
    throw new Error("Could not reach the secure checkout service. Check your internet and try again.");
  } finally {
    clearTimeout(timeout);
  }

  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(parseError(payload) || `Could not create checkout (${response.status}).`);
  }
  if (!isPlainObject(payload)) throw new Error("The checkout service returned an invalid response.");

  const order = isPlainObject(payload.order) ? payload.order : {};
  const orderId = requiredString(order.id, "Order ID", 100);
  const txRef = requiredString(payload.tx_ref, "Payment reference", 300);
  const paymentIntentId = requiredString(payload.payment_id, "Payment intent ID", 100);
  const checkoutUrl = requiredString(payload.checkout_url, "Checkout URL");
  const totalMwk = Number(order.total_mwk);
  const returnedQuantity = Number(order.quantity);

  if (!Number.isSafeInteger(totalMwk) || totalMwk <= 0) throw new Error("The checkout total is invalid.");
  if (!Number.isInteger(returnedQuantity) || returnedQuantity !== quantity) {
    throw new Error("The checkout quantity does not match your order.");
  }
  if (!isTrustedPayChanguCheckoutUrl(checkoutUrl)) {
    throw new Error("The payment provider returned an untrusted checkout address.");
  }

  return {
    order: { id: orderId, totalMwk, quantity: returnedQuantity },
    checkoutUrl,
    txRef,
    paymentIntentId,
  };
}
