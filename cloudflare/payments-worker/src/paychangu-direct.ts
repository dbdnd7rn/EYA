import type { PaymentIntentRecord, PaymentsEnv } from "./ledger";
import { PaymentProviderError } from "./paychangu";

const DEFAULT_PAYCHANGU_API_BASE_URL = "https://api.paychangu.com";
const REQUEST_TIMEOUT_MS = 15_000;
const OPERATOR_CACHE_MS = 10 * 60 * 1000;

type JsonObject = Record<string, unknown>;
type DirectMethod = "airtel_money" | "mpamba" | "bank_transfer";

export type PayChanguDirectChargeResult = {
  providerReference: string;
  providerPayload: JsonObject;
  paymentAccountDetails: JsonObject | null;
  authorization: JsonObject | null;
};

let operatorCache: { expiresAt: number; rows: JsonObject[] } | null = null;

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

async function fetchPayChanguJson(
  env: PaymentsEnv,
  path: string,
  init: RequestInit,
): Promise<JsonObject> {
  const secretKey = requiredConfig(env.PAYCHANGU_SECRET_KEY, "PAYCHANGU_SECRET_KEY");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let response: Response;

  try {
    response = await fetch(`${normalizeApiBaseUrl(env.PAYCHANGU_API_BASE_URL)}${path}`, {
      ...init,
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${secretKey}`,
        ...(init.body ? { "Content-Type": "application/json" } : {}),
        ...(init.headers || {}),
      },
      signal: controller.signal,
    });
  } catch (error) {
    const timedOut = error instanceof DOMException && error.name === "AbortError";
    throw new PaymentProviderError(
      timedOut ? "PayChangu direct charge request timed out." : "Could not reach PayChangu.",
      null,
      {},
    );
  } finally {
    clearTimeout(timeout);
  }

  const providerPayload = parseProviderJson(await response.text());
  if (!response.ok) {
    throw new PaymentProviderError(
      asNonEmptyString(providerPayload.message) || "PayChangu rejected the direct charge request.",
      response.status,
      providerPayload,
    );
  }
  return providerPayload;
}

function collectObjects(value: unknown, rows: JsonObject[] = []): JsonObject[] {
  if (Array.isArray(value)) {
    value.forEach((entry) => collectObjects(entry, rows));
    return rows;
  }
  const object = asObject(value);
  if (!object) return rows;
  rows.push(object);
  Object.values(object).forEach((entry) => collectObjects(entry, rows));
  return rows;
}

async function getSupportedOperators(env: PaymentsEnv): Promise<JsonObject[]> {
  if (operatorCache && operatorCache.expiresAt > Date.now()) return operatorCache.rows;
  const payload = await fetchPayChanguJson(env, "/mobile-money/", { method: "GET" });
  const rows = collectObjects(payload).filter((row) => {
    const ref = asNonEmptyString(row.ref_id ?? row.refId ?? row.id);
    const name = asNonEmptyString(row.name ?? row.operator_name ?? row.operator);
    return Boolean(ref && name);
  });
  operatorCache = { expiresAt: Date.now() + OPERATOR_CACHE_MS, rows };
  return rows;
}

async function resolveOperatorRef(env: PaymentsEnv, method: "airtel_money" | "mpamba"): Promise<string> {
  const rows = await getSupportedOperators(env);
  const match = rows.find((row) => {
    const name = String(row.name ?? row.operator_name ?? row.operator ?? "").toLowerCase();
    return method === "airtel_money" ? name.includes("airtel") : name.includes("mpamba") || name.includes("tnm");
  });
  const ref = asNonEmptyString(match?.ref_id ?? match?.refId ?? match?.id);
  if (!ref) throw new PaymentProviderError(`PayChangu did not return a supported ${method === "airtel_money" ? "Airtel Money" : "TNM Mpamba"} operator.`, 502, {});
  return ref;
}

function normalizeMalawiMobile(value: string | null): string {
  const digits = String(value || "").replace(/\D/g, "");
  const local = digits.startsWith("265") ? digits.slice(3) : digits.startsWith("0") ? digits.slice(1) : digits;
  if (!/^\d{9}$/.test(local)) throw new Error("A valid Malawi mobile-money number is required.");
  return `0${local}`;
}

function normalizeCurrency(value: unknown): string {
  const currency = String(value || "").trim().toUpperCase();
  return currency === "MK" ? "MWK" : currency;
}

function assertDirectTransaction(intent: PaymentIntentRecord, transaction: JsonObject): void {
  const chargeId = asNonEmptyString(transaction.charge_id ?? transaction.chargeId);
  if (chargeId !== intent.merchant_reference) {
    throw new PaymentProviderError("PayChangu returned an unexpected direct charge reference.", 502, transaction);
  }
  const amount = Number(transaction.amount);
  if (!Number.isSafeInteger(amount) || amount !== intent.expected_amount_mwk) {
    throw new PaymentProviderError("PayChangu returned an unexpected direct charge amount.", 502, transaction);
  }
  if (normalizeCurrency(transaction.currency) !== "MWK") {
    throw new PaymentProviderError("PayChangu returned an unexpected direct charge currency.", 502, transaction);
  }
  const status = String(transaction.status || "").trim().toLowerCase();
  if (!["pending", "processing", "success", "successful"].includes(status)) {
    throw new PaymentProviderError("PayChangu returned an unexpected direct charge status.", 502, transaction);
  }
}

async function initiateMobileMoney(
  env: PaymentsEnv,
  intent: PaymentIntentRecord,
  method: "airtel_money" | "mpamba",
): Promise<PayChanguDirectChargeResult> {
  const operatorRef = await resolveOperatorRef(env, method);
  const payload = await fetchPayChanguJson(env, "/mobile-money/payments/initialize", {
    method: "POST",
    body: JSON.stringify({
      mobile: normalizeMalawiMobile(intent.customer_phone),
      mobile_money_operator_ref_id: operatorRef,
      amount: String(intent.expected_amount_mwk),
      charge_id: intent.merchant_reference,
      email: intent.customer_email || undefined,
    }),
  });
  if (!['success', 'successful'].includes(String(payload.status || '').toLowerCase())) {
    throw new PaymentProviderError(asNonEmptyString(payload.message) || "PayChangu did not initialize the mobile-money charge.", 502, payload);
  }
  const data = asObject(payload.data) || {};
  const transaction = asObject(data.transaction) || data;
  assertDirectTransaction(intent, transaction);
  const providerReference = asNonEmptyString(transaction.ref_id ?? transaction.reference);
  if (!providerReference) throw new PaymentProviderError("PayChangu mobile-money response did not include a provider reference.", 502, payload);
  return {
    providerReference,
    providerPayload: payload,
    paymentAccountDetails: null,
    authorization: asObject(transaction.authorization),
  };
}

async function initiateBankTransfer(
  env: PaymentsEnv,
  intent: PaymentIntentRecord,
): Promise<PayChanguDirectChargeResult> {
  const payload = await fetchPayChanguJson(env, "/direct-charge/payments/initialize", {
    method: "POST",
    body: JSON.stringify({
      payment_method: "mobile_bank_transfer",
      amount: String(intent.expected_amount_mwk),
      currency: "MWK",
      charge_id: intent.merchant_reference,
      email: intent.customer_email || undefined,
      mobile: intent.customer_phone || undefined,
      create_permanent_account: false,
    }),
  });
  if (!['success', 'successful'].includes(String(payload.status || '').toLowerCase())) {
    throw new PaymentProviderError(asNonEmptyString(payload.message) || "PayChangu did not initialize the bank-transfer charge.", 502, payload);
  }
  const data = asObject(payload.data) || {};
  const transaction = asObject(data.transaction) || {};
  assertDirectTransaction(intent, transaction);
  const account = asObject(data.payment_account_details);
  if (!account || !asNonEmptyString(account.bank_name) || !asNonEmptyString(account.account_number) || !asNonEmptyString(account.account_name)) {
    throw new PaymentProviderError("PayChangu bank-transfer response did not include complete account details.", 502, payload);
  }
  const providerReference = asNonEmptyString(transaction.ref_id ?? transaction.reference);
  if (!providerReference) throw new PaymentProviderError("PayChangu bank-transfer response did not include a provider reference.", 502, payload);
  return {
    providerReference,
    providerPayload: payload,
    paymentAccountDetails: account,
    authorization: asObject(transaction.authorization),
  };
}

export async function initiatePayChanguDirectCharge(
  env: PaymentsEnv,
  intent: PaymentIntentRecord,
): Promise<PayChanguDirectChargeResult> {
  const method = intent.method as DirectMethod;
  if (method === "airtel_money" || method === "mpamba") return initiateMobileMoney(env, intent, method);
  if (method === "bank_transfer") return initiateBankTransfer(env, intent);
  throw new Error("This payment method does not use a direct charge.");
}

export function readDirectChargePresentation(
  method: string,
  providerPayload: JsonObject,
): { paymentAccountDetails: JsonObject | null; authorization: JsonObject | null } {
  if (method === "bank_transfer") {
    const data = asObject(providerPayload.data) || {};
    const transaction = asObject(data.transaction) || {};
    return {
      paymentAccountDetails: asObject(data.payment_account_details),
      authorization: asObject(transaction.authorization),
    };
  }
  const data = asObject(providerPayload.data) || {};
  const transaction = asObject(data.transaction) || data;
  return { paymentAccountDetails: null, authorization: asObject(transaction.authorization) };
}
