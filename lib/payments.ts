import { ENV } from "@/lib/env";
import { supabase } from "@/lib/supabase";

export type SupportedPaymentMethod = "airtel_money" | "mpamba" | "bank_transfer";

export type InitPaymentInput = {
  amountMwk: number;
  email?: string | null;
  phone?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  project?: string;
  txRef?: string;
  title?: string;
  description: string;
  method: SupportedPaymentMethod;
  metadata?: Record<string, unknown>;
};

export type DirectChargeSession = {
  txRef: string;
  status: string;
  providerReference: string | null;
  paymentAccountDetails: Record<string, unknown> | null;
  authorization: Record<string, unknown> | null;
  message: string | null;
  checkoutUrl?: string | null;
};

function parseError(payload: any): string | null {
  if (!payload || typeof payload !== "object") return null;
  return payload.message || payload.error || payload.detail || null;
}

function asObject(value: any): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value : null;
}

function parseDirectCharge(payload: any, fallbackTxRef?: string): DirectChargeSession | null {
  if (!payload || typeof payload !== "object") return null;

  const txRef = typeof payload.tx_ref === "string" && payload.tx_ref.trim()
    ? payload.tx_ref.trim()
    : typeof fallbackTxRef === "string" && fallbackTxRef.trim()
      ? fallbackTxRef.trim()
      : null;
  if (!txRef) return null;

  const charge = asObject(payload.direct_charge) ?? {};
  const status = typeof charge.status === "string" && charge.status.trim() ? charge.status.trim() : "pending";

  return {
    txRef,
    status,
    providerReference: typeof charge.provider_reference === "string" ? charge.provider_reference : null,
    paymentAccountDetails: asObject(charge.payment_account_details),
    authorization: asObject(charge.authorization),
    message: typeof payload.message === "string" ? payload.message : null,
    checkoutUrl: null,
  };
}

function parseHostedCheckout(payload: any, fallbackTxRef?: string): DirectChargeSession | null {
  if (!payload || typeof payload !== "object") return null;
  const checkoutUrl = typeof payload.checkout_url === "string" ? payload.checkout_url : null;
  const txRef = typeof payload.tx_ref === "string" && payload.tx_ref.trim()
    ? payload.tx_ref.trim()
    : typeof fallbackTxRef === "string" && fallbackTxRef.trim()
      ? fallbackTxRef.trim()
      : null;
  if (!checkoutUrl || !txRef) return null;
  return {
    txRef,
    status: "pending",
    providerReference: null,
    paymentAccountDetails: null,
    authorization: null,
    message: typeof payload.message === "string" ? payload.message : null,
    checkoutUrl,
  };
}

async function authenticatedBackendHeaders() {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw new Error("Could not verify your EYA session.");
  const accessToken = data.session?.access_token?.trim();
  if (!accessToken) throw new Error("Please log in again before making a payment.");
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${accessToken}`,
  };
}

function legacyPaymentBackendBaseUrl() {
  if (!ENV.LEGACY_PAYMENT_BACKEND_URL) {
    throw new Error("The temporary commerce payment bridge is not configured.");
  }
  return ENV.LEGACY_PAYMENT_BACKEND_URL.replace(/\/+$/, "");
}

/**
 * TEMPORARY compatibility path for the existing generic commerce checkout.
 * Ticket checkout already uses Supabase Edge -> VAC Payments on Cloudflare.
 * This function must be retired when generic commerce checkout is migrated to
 * the same trusted Cloudflare payment boundary.
 */
export async function initializePayChanguCheckout(input: InitPaymentInput): Promise<DirectChargeSession> {
  const project = input.project ?? "eya";
  const payload = {
    amount: input.amountMwk,
    currency: "MWK",
    email: input.email ?? undefined,
    project,
    tx_ref: input.txRef ?? undefined,
    first_name: input.firstName ?? undefined,
    last_name: input.lastName ?? undefined,
    title: input.title ?? `EYA ${project} payment`,
    description: input.description,
    meta: {
      payment_method: input.method,
      msisdn: input.phone ?? undefined,
      tx_ref_hint: input.txRef ?? undefined,
      ...(input.metadata ?? {}),
    },
  };
  const url = `${legacyPaymentBackendBaseUrl()}/api/paychangu/initiate`;
  try {
    const headers = await authenticatedBackendHeaders();
    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    const hostedCheckout = parseHostedCheckout(data, input.txRef);
    if (res.ok && hostedCheckout) return hostedCheckout;
    const directCharge = parseDirectCharge(data, input.txRef);
    if (res.ok && directCharge) return directCharge;
    const message = parseError(data);
    throw new Error(message ? `Payment initialization failed: ${message}` : `Payment initialization failed (${res.status}).`);
  } catch (e: any) {
    throw new Error(e?.message || "Unable to initialize payment.");
  }
}

export function isOkPaychanguVerify(resp: any): boolean {
  const explicitPaidFlags = [
    resp?.paid,
    resp?.is_paid,
    resp?.data?.paid,
    resp?.data?.is_paid,
    resp?.data?.transaction?.paid,
    resp?.transaction?.paid,
    resp?.data?.data?.paid,
    resp?.data?.data?.is_paid,
  ];
  if (explicitPaidFlags.some((value) => value === true)) return true;

  const paymentStatus = [
    resp?.status,
    resp?.payment_status,
    resp?.data?.status,
    resp?.data?.transaction?.status,
    resp?.transaction?.status,
    resp?.data?.payment_status,
    resp?.data?.data?.payment_status,
    resp?.data?.data?.status,
    resp?.data?.transaction?.authorization?.status,
    resp?.transaction?.authorization?.status,
    resp?.data?.authorization?.status,
    resp?.data?.data?.authorization?.status,
  ].find((value) => typeof value === "string" && value.trim());

  const normalized = String(paymentStatus || "").toLowerCase();
  return ["paid", "successful", "completed", "successfully_completed"].includes(normalized);
}

export type PayChanguVerifyResult = {
  paid: boolean;
  paymentStatus: string | null;
  paymentId: string | null;
  orderId: string | null;
  fulfilled: boolean;
  raw: any;
};

/**
 * TEMPORARY compatibility verification for the same legacy generic-commerce
 * bridge. The request remains authenticated and must not be repointed at the
 * Vercel EYA backend, where provider verification is intentionally retired.
 */
export async function verifyPayChanguTxRef(txRef: string): Promise<PayChanguVerifyResult> {
  const url = `${legacyPaymentBackendBaseUrl()}/api/paychangu/verify/${encodeURIComponent(txRef)}`;
  const headers = await authenticatedBackendHeaders();
  const res = await fetch(url, { method: "GET", headers });
  if (!res.ok) throw new Error(`Verification failed (${res.status}).`);
  const data = await res.json().catch(() => ({}));
  return {
    paid: isOkPaychanguVerify(data),
    paymentStatus: typeof data?.payment_status === "string" ? data.payment_status : null,
    paymentId: typeof data?.payment_id === "string" ? data.payment_id : null,
    orderId: typeof data?.related_order_id === "string" ? data.related_order_id : null,
    fulfilled: data?.fulfilled === true,
    raw: data,
  };
}
