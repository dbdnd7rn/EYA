import type { PaymentsEnv } from "./ledger";
import { PaymentProviderError } from "./paychangu";

const DEFAULT_PAYCHANGU_API_BASE_URL = "https://api.paychangu.com";
const REQUEST_TIMEOUT_MS = 15_000;
const encoder = new TextEncoder();

type JsonObject = Record<string, unknown>;

export type PayChanguVerificationResult = {
  txRef: string;
  providerReference: string | null;
  status: "success" | "pending" | "failed" | "cancelled" | "expired";
  currency: string;
  amountMwk: number;
  providerPayload: JsonObject;
};

function asObject(value: unknown): JsonObject | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonObject)
    : null;
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

  if (url.protocol !== "https:") {
    throw new Error("PAYCHANGU_API_BASE_URL must use HTTPS.");
  }

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
  if (status === "success" || status === "successful" || status === "paid") return "success";
  if (status === "pending" || status === "processing") return "pending";
  if (status === "failed" || status === "failure") return "failed";
  if (status === "cancelled" || status === "canceled") return "cancelled";
  if (status === "expired") return "expired";
  throw new PaymentProviderError("PayChangu returned an unsupported transaction status.", 502, {});
}

async function fetchPayChanguJson(
  env: PaymentsEnv,
  path: string,
  init: RequestInit,
): Promise<JsonObject> {
  const apiBaseUrl = normalizeApiBaseUrl(env.PAYCHANGU_API_BASE_URL);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(`${apiBaseUrl}${path}`, {
      ...init,
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

  const responseText = await response.text();
  const providerPayload = parseProviderJson(responseText);

  if (!response.ok) {
    throw new PaymentProviderError(
      asNonEmptyString(providerPayload.message) || "PayChangu rejected the verification request.",
      response.status,
      providerPayload,
    );
  }

  return providerPayload;
}

export async function verifyPayChanguTransaction(
  env: PaymentsEnv,
  txRef: string,
): Promise<PayChanguVerificationResult> {
  const secretKey = requiredConfig(env.PAYCHANGU_SECRET_KEY, "PAYCHANGU_SECRET_KEY");
  const providerPayload = await fetchPayChanguJson(
    env,
    `/verify-payment/${encodeURIComponent(txRef)}`,
    {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${secretKey}`,
      },
    },
  );

  if (asNonEmptyString(providerPayload.status) !== "success") {
    throw new PaymentProviderError(
      asNonEmptyString(providerPayload.message) || "PayChangu could not verify the transaction.",
      502,
      providerPayload,
    );
  }

  const data = asObject(providerPayload.data);
  const returnedTxRef = asNonEmptyString(data?.tx_ref);
  const currency = asNonEmptyString(data?.currency);
  const amount = Number(data?.amount);

  if (!returnedTxRef) {
    throw new PaymentProviderError("PayChangu verification did not include tx_ref.", 502, providerPayload);
  }
  if (!currency) {
    throw new PaymentProviderError("PayChangu verification did not include currency.", 502, providerPayload);
  }
  if (!Number.isSafeInteger(amount) || amount < 0) {
    throw new PaymentProviderError("PayChangu verification returned an invalid amount.", 502, providerPayload);
  }

  return {
    txRef: returnedTxRef,
    providerReference: asNonEmptyString(data?.reference),
    status: normalizeTransactionStatus(data?.status),
    currency,
    amountMwk: amount,
    providerPayload,
  };
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

export async function verifyPayChanguWebhookSignature(
  rawBody: string,
  suppliedSignature: string | null,
  webhookSecret: string | undefined,
): Promise<boolean> {
  const secret = requiredConfig(webhookSecret, "PAYCHANGU_WEBHOOK_SECRET");
  const normalizedSignature = (suppliedSignature || "")
    .trim()
    .toLowerCase()
    .replace(/^sha256=/, "");

  if (!/^[0-9a-f]{64}$/.test(normalizedSignature)) return false;
  const expectedSignature = await hmacSha256Hex(secret, rawBody);
  return constantTimeEqual(expectedSignature, normalizedSignature);
}

export async function createWebhookEventKey(rawBody: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(rawBody));
  return `sha256:${bytesToHex(new Uint8Array(digest))}`;
}

export function extractPayChanguTxRef(payload: unknown): string | null {
  const root = asObject(payload);
  const data = asObject(root?.data);
  const transaction = asObject(root?.transaction);
  const nestedTransaction = asObject(data?.transaction);

  return (
    asNonEmptyString(root?.tx_ref) ||
    asNonEmptyString(data?.tx_ref) ||
    asNonEmptyString(transaction?.tx_ref) ||
    asNonEmptyString(nestedTransaction?.tx_ref)
  );
}
