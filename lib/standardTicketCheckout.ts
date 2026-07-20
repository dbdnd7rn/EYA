import { ENV } from "@/lib/env";

const REQUEST_TIMEOUT_MS = 15_000;
const PAYCHANGU_CHECKOUT_HOSTS = new Set(["checkout.paychangu.com"]);

export type HybridPaymentMethod = "airtel_money" | "mpamba" | "bank_transfer" | "card";

export type HybridTicketCheckoutInput = {
  eventId: string;
  tierId: string;
  quantity: number;
  paymentMethod: HybridPaymentMethod;
  phone?: string | null;
};

export type BankTransferDetails = {
  bankName: string;
  accountNumber: string;
  accountName: string;
  expiresAt: number | null;
};

export type HybridTicketCheckoutSession = {
  order: {
    id: string;
    totalMwk: number;
    quantity: number;
  };
  checkoutUrl: string | null;
  txRef: string;
  paymentIntentId: string;
  paymentMethod: HybridPaymentMethod;
  directCharge: {
    status: string;
    providerReference: string | null;
    bankTransfer: BankTransferDetails | null;
    authorization: Record<string, unknown> | null;
  };
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

function optionalString(value: unknown, maxLength = 2000): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const normalized = value.trim();
  return normalized.length <= maxLength ? normalized : null;
}

function parseError(payload: unknown): string | null {
  if (!isPlainObject(payload)) return null;
  const value = payload.message ?? payload.error ?? payload.detail;
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function isTrustedPayChanguCheckoutUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password && PAYCHANGU_CHECKOUT_HOSTS.has(url.hostname.toLowerCase());
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

function normalizePhone(value?: string | null): string | null {
  if (!value) return null;
  const digits = value.replace(/\D/g, "");
  const local = digits.startsWith("265") ? digits.slice(3) : digits.startsWith("0") ? digits.slice(1) : digits;
  if (!/^\d{9}$/.test(local)) throw new Error("Enter a valid 9-digit Malawi mobile-money number.");
  return `+265${local}`;
}

function parseBankTransfer(value: unknown): BankTransferDetails | null {
  if (!isPlainObject(value)) return null;
  const bankName = optionalString(value.bank_name, 160);
  const accountNumber = optionalString(value.account_number, 80);
  const accountName = optionalString(value.account_name, 160);
  if (!bankName || !accountNumber || !accountName) return null;
  const expires = Number(value.account_expiration_timestamp);
  return {
    bankName,
    accountNumber,
    accountName,
    expiresAt: Number.isSafeInteger(expires) && expires > 0 ? expires : null,
  };
}

export async function createHybridTicketCheckout(
  accessToken: string,
  input: HybridTicketCheckoutInput,
): Promise<HybridTicketCheckoutSession> {
  if (!accessToken.trim()) throw new Error("Your login session is unavailable. Please sign in again.");

  const eventId = validateIdentifier(input.eventId, "Event");
  const tierId = validateIdentifier(input.tierId, "Ticket type");
  const quantity = Number(input.quantity);
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 10) {
    throw new Error("Ticket quantity must be between 1 and 10.");
  }
  const paymentMethod = input.paymentMethod;
  if (!["airtel_money", "mpamba", "bank_transfer", "card"].includes(paymentMethod)) {
    throw new Error("The selected payment method is unavailable.");
  }
  const phone = normalizePhone(input.phone);
  if ((paymentMethod === "airtel_money" || paymentMethod === "mpamba") && !phone) {
    throw new Error("A mobile-money phone number is required.");
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
        payment_method: paymentMethod,
        phone,
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
  if (!response.ok) throw new Error(parseError(payload) || `Could not create checkout (${response.status}).`);
  if (!isPlainObject(payload)) throw new Error("The checkout service returned an invalid response.");

  const order = isPlainObject(payload.order) ? payload.order : {};
  const orderId = requiredString(order.id, "Order ID", 100);
  const txRef = requiredString(payload.tx_ref, "Payment reference", 300);
  const paymentIntentId = requiredString(payload.payment_id, "Payment intent ID", 100);
  const returnedMethod = requiredString(payload.payment_method, "Payment method", 40) as HybridPaymentMethod;
  const totalMwk = Number(order.total_mwk);
  const returnedQuantity = Number(order.quantity);

  if (returnedMethod !== paymentMethod) throw new Error("The payment method returned by the server does not match your selection.");
  if (!Number.isSafeInteger(totalMwk) || totalMwk <= 0) throw new Error("The checkout total is invalid.");
  if (!Number.isInteger(returnedQuantity) || returnedQuantity !== quantity) {
    throw new Error("The checkout quantity does not match your order.");
  }

  const direct = isPlainObject(payload.direct_charge) ? payload.direct_charge : {};
  const checkoutUrl = optionalString(payload.checkout_url);
  const providerReference = optionalString(direct.provider_reference, 300);
  const bankTransfer = parseBankTransfer(direct.payment_account_details);
  const authorization = isPlainObject(direct.authorization) ? direct.authorization : null;

  if (paymentMethod === "card") {
    if (!checkoutUrl || !isTrustedPayChanguCheckoutUrl(checkoutUrl)) {
      throw new Error("The payment provider returned an untrusted checkout address.");
    }
  } else if (checkoutUrl) {
    throw new Error("The direct payment response unexpectedly included a hosted checkout address.");
  }

  if ((paymentMethod === "airtel_money" || paymentMethod === "mpamba") && !providerReference) {
    throw new Error("The mobile-money request did not return a provider reference.");
  }
  if (paymentMethod === "bank_transfer" && (!providerReference || !bankTransfer)) {
    throw new Error("The bank-transfer request did not return complete account details.");
  }

  return {
    order: { id: orderId, totalMwk, quantity: returnedQuantity },
    checkoutUrl,
    txRef,
    paymentIntentId,
    paymentMethod,
    directCharge: {
      status: optionalString(direct.status, 80) || "pending",
      providerReference,
      bankTransfer,
      authorization,
    },
  };
}
