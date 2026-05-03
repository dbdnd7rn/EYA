import { ENV } from "@/lib/env";

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

export async function initializePayChanguCheckout(input: InitPaymentInput): Promise<DirectChargeSession> {
  if (!ENV.PAYCHANGU_BACKEND) {
    throw new Error("PayChangu backend URL is not configured. Set EXPO_PUBLIC_PAYCHANGU_BACKEND.");
  }

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
  const url = `${ENV.PAYCHANGU_BACKEND.replace(/\/+$/, "")}/api/paychangu/initiate`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
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

export async function verifyPayChanguTxRef(txRef: string): Promise<PayChanguVerifyResult> {
  if (!ENV.PAYCHANGU_BACKEND) {
    throw new Error("PayChangu backend URL is not configured. Set EXPO_PUBLIC_PAYCHANGU_BACKEND.");
  }
  const url = `${ENV.PAYCHANGU_BACKEND.replace(/\/+$/, "")}/api/paychangu/verify/${encodeURIComponent(txRef)}`;
  const res = await fetch(url, { method: "GET" });
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


