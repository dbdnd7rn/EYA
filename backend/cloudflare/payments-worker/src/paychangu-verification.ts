import type { PaymentCurrency, PaymentIntentRecord, PaymentsEnv } from "./ledger";
import { PaymentProviderError, providerAmountToMinor } from "./paychangu";

const DEFAULT_PAYCHANGU_API_BASE_URL = "https://api.paychangu.com";
const REQUEST_TIMEOUT_MS = 15_000;
const encoder = new TextEncoder();

type JsonObject = Record<string, unknown>;

export type PayChanguVerificationResult = {
  txRef: string;
  providerReference: string | null;
  status: "success" | "pending" | "failed" | "cancelled" | "expired";
  currency: PaymentCurrency;
  amountMinor: number;
  providerPayload: JsonObject;
};

function asObject(value: unknown): JsonObject | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonObject) : null;
}

function asNonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function requiredConfig(value: string | undefined, name: string): string {
  const normalized = value?.trim();
  if (!normalized) throw new Error(`Missing Worker configuration: ${name}.`);
  return normalized;
}

function normalizeApiBaseUrl(value: string | undefined): string {
  const candidate = value?.trim() || DEFAULT_PAYCHANGU_API_BASE_URL;
  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    throw new Error("PAYCHANGU_API_BASE_URL must be a valid URL.");
  }
  if (url.protocol !== "https:") throw new Error("PAYCHANGU_API_BASE_URL must use HTTPS.");
  return url.toString().replace(/\/$/, "");
}

function parseProviderJson(text: string): JsonObject {
  if (!text.trim()) return {};
  try {
    const parsed: unknown = JSON.parse(text);
    return asObject(parsed) || { raw: text };
  } catch {
    return { raw: text };
  }
}

function normalizeTransactionStatus(value: unknown): PayChanguVerificationResult["status"] {
  const status = asNonEmptyString(value)?.toLowerCase();
  if (status === "success" || status === "successful" || status === "paid" || status === "completed") return "success";
  if (status === "pending" || status === "processing" || status === "initiated") return "pending";
  if (status === "failed" || status === "failure") return "failed";
  if (status === "cancelled" || status === "canceled") return "cancelled";
  if (status === "expired") return "expired";
  throw new PaymentProviderError("PayChangu returned an unsupported transaction status.", 502, {});
}

function normalizeCurrency(value: unknown): PaymentCurrency | null {
  const currency = String(value || "").trim().toUpperCase();
  if (currency === "MK" || currency === "MWK") return "MWK";
  if (currency === "USD") return "USD";
  return null;
}

async function fetchPayChanguJson(env: PaymentsEnv, path: string): Promise<JsonObject> {
  const secretKey = requiredConfig(env.PAYCHANGU_SECRET_KEY, "PAYCHANGU_SECRET_KEY");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(`${normalizeApiBaseUrl(env.PAYCHANGU_API_BASE_URL)}${path}`, {
      method: "GET",
      headers: { Accept: "application/json", Authorization: `Bearer ${secretKey}` },
      signal: controller.signal,
    });
  } catch (error) {
    const timedOut = error instanceof DOMException && error.name === "AbortError";
    throw new PaymentProviderError(
      timedOut ? "PayChangu verification request timed out." : "Could not reach PayChangu for verification.",
      null,
      {},
    );
  } finally {
    clearTimeout(timeout);
  }

  const providerPayload = parseProviderJson(await response.text());
  if (!response.ok) {
    throw new PaymentProviderError(
      asNonEmptyString(providerPayload.message) || "PayChangu rejected the verification request.",
      response.status,
      providerPayload,
    );
  }
  return providerPayload;
}

function parseVerification(
  providerPayload: JsonObject,
  intent: PaymentIntentRecord,
): PayChanguVerificationResult {
  if (intent.method === "card" || intent.method === "hosted_checkout") {
    if (asNonEmptyString(providerPayload.status)?.toLowerCase() !== "success") {
      throw new PaymentProviderError(asNonEmptyString(providerPayload.message) || "PayChangu could not verify the transaction.", 502, providerPayload);
    }
    const data = asObject(providerPayload.data) || {};
    const txRef = asNonEmptyString(data.tx_ref);
    const currency = normalizeCurrency(data.currency);
    if (!txRef || !currency) {
      throw new PaymentProviderError("PayChangu returned incomplete hosted-checkout verification data.", 502, providerPayload);
    }
    return {
      txRef,
      providerReference: asNonEmptyString(data.reference ?? data.ref_id),
      status: normalizeTransactionStatus(data.status),
      currency,
      amountMinor: providerAmountToMinor(currency, data.amount),
      providerPayload,
    };
  }

  if (intent.method === "bank_transfer") {
    if (!["success", "successful"].includes(String(providerPayload.status || "").toLowerCase())) {
      throw new PaymentProviderError(asNonEmptyString(providerPayload.message) || "PayChangu could not verify the bank transfer.", 502, providerPayload);
    }
    const data = asObject(providerPayload.data) || {};
    const transaction = asObject(data.transaction) || data;
    const txRef = asNonEmptyString(transaction.charge_id ?? transaction.chargeId);
    const currency = normalizeCurrency(transaction.currency);
    if (!txRef || currency !== "MWK") {
      throw new PaymentProviderError("PayChangu returned incomplete bank-transfer verification data.", 502, providerPayload);
    }
    return {
      txRef,
      providerReference: asNonEmptyString(transaction.ref_id ?? transaction.reference),
      status: normalizeTransactionStatus(transaction.status),
      currency,
      amountMinor: providerAmountToMinor("MWK", transaction.amount),
      providerPayload,
    };
  }

  const outerStatus = String(providerPayload.status || "").toLowerCase();
  if (!["success", "successful"].includes(outerStatus)) {
    throw new PaymentProviderError(asNonEmptyString(providerPayload.message) || "PayChangu could not verify the mobile-money charge.", 502, providerPayload);
  }
  const data = asObject(providerPayload.data) || {};
  const transaction = asObject(data.transaction) || data;
  const txRef = asNonEmptyString(transaction.charge_id ?? transaction.chargeId);
  const currency = normalizeCurrency(transaction.currency);
  if (!txRef || currency !== "MWK") {
    throw new PaymentProviderError("PayChangu returned incomplete mobile-money verification data.", 502, providerPayload);
  }
  return {
    txRef,
    providerReference: asNonEmptyString(transaction.ref_id ?? transaction.reference),
    status: normalizeTransactionStatus(transaction.status ?? providerPayload.status),
    currency,
    amountMinor: providerAmountToMinor("MWK", transaction.amount),
    providerPayload,
  };
}

export async function verifyPayChanguTransaction(
  env: PaymentsEnv,
  intent: PaymentIntentRecord,
): Promise<PayChanguVerificationResult> {
  const ref = encodeURIComponent(intent.merchant_reference);
  const path = intent.method === "card" || intent.method === "hosted_checkout"
    ? `/verify-payment/${ref}`
    : intent.method === "bank_transfer"
      ? `/direct-charge/transactions/${ref}/details`
      : `/mobile-money/payments/${ref}/verify`;
  return parseVerification(await fetchPayChanguJson(env, path), intent);
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
}

function constantTimeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let mismatch = 0;
  for (let index = 0; index < left.length; index += 1) mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return mismatch === 0;
}

async function hmacSha256Hex(secret: string, value: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(value));
  return bytesToHex(new Uint8Array(signature));
}

export async function verifyPayChanguWebhookSignature(
  rawBody: string,
  suppliedSignature: string | null,
  webhookSecret: string | undefined,
): Promise<boolean> {
  const secret = requiredConfig(webhookSecret, "PAYCHANGU_WEBHOOK_SECRET");
  const normalizedSignature = (suppliedSignature || "").trim().toLowerCase().replace(/^sha256=/, "");
  if (!/^[0-9a-f]{64}$/.test(normalizedSignature)) return false;
  const expectedSignature = await hmacSha256Hex(secret, rawBody);
  return constantTimeEqual(expectedSignature, normalizedSignature);
}

export async function createWebhookEventKey(rawBody: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(rawBody));
  return `sha256:${bytesToHex(new Uint8Array(digest))}`;
}

export function extractPayChanguReference(payload: unknown): string | null {
  const root = asObject(payload);
  const data = asObject(root?.data);
  const transaction = asObject(root?.transaction);
  const nestedTransaction = asObject(data?.transaction);
  return (
    asNonEmptyString(root?.tx_ref) ||
    asNonEmptyString(root?.charge_id) ||
    asNonEmptyString(data?.tx_ref) ||
    asNonEmptyString(data?.charge_id) ||
    asNonEmptyString(transaction?.tx_ref) ||
    asNonEmptyString(transaction?.charge_id) ||
    asNonEmptyString(nestedTransaction?.tx_ref) ||
    asNonEmptyString(nestedTransaction?.charge_id)
  );
}
