import { Buffer } from "node:buffer";
import crypto from "node:crypto";
import { config, getCancelUrl, getSuccessUrl } from "./config.js";

const PAYCHANGU_API_BASE = "https://api.paychangu.com";
const PAYCHANGU_SECRET_MISSING_MESSAGE = "PAYCHANGU_SECRET_KEY is not configured on the backend.";
const PAYCHANGU_SECRET_PUBLIC_KEY_MESSAGE = "PAYCHANGU_SECRET_KEY must be a PayChangu secret key, not a public/mobile key.";
// Keep provider parsing centralized here so payment routes stay thin.

export class PayChanguConfigurationError extends Error {
  constructor(message) {
    super(message);
    this.name = "PayChanguConfigurationError";
    this.publicMessage = message;
    this.statusCode = 500;
  }
}

export class PayChanguRequestError extends Error {
  constructor(message, { endpoint, statusCode, payload }) {
    super(message);
    this.name = "PayChanguRequestError";
    this.endpoint = endpoint;
    this.statusCode = statusCode;
    this.payload = payload;
    this.publicMessage = getPublicPayChanguMessage(message, statusCode);
  }
}

function getPayChanguSecretKey() {
  const secretKey = config.paychanguSecretKey;
  if (!secretKey) {
    throw new PayChanguConfigurationError(PAYCHANGU_SECRET_MISSING_MESSAGE);
  }

  const publicKey = config.paychanguPublicKey;
  if (
    (publicKey && secretKey === publicKey) ||
    /^(pk|pub|public|test-public|live-public)[_-]/i.test(secretKey) ||
    /^EXPO_PUBLIC_/i.test(secretKey)
  ) {
    throw new PayChanguConfigurationError(PAYCHANGU_SECRET_PUBLIC_KEY_MESSAGE);
  }

  return secretKey;
}

function getJsonHeaders() {
  return {
    Accept: "application/json",
    "Content-Type": "application/json",
    Authorization: `Bearer ${getPayChanguSecretKey()}`,
  };
}

function getAuthHeaders() {
  return {
    Accept: "application/json",
    Authorization: `Bearer ${getPayChanguSecretKey()}`,
  };
}

async function readJson(response) {
  const text = await response.text();
  if (!text) return {};

  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

function parsePayChanguError(payload, fallbackStatus) {
  if (!payload || typeof payload !== "object") {
    return `PayChangu request failed (${fallbackStatus}).`;
  }

  const directMessage =
    payload.message ||
    payload.error ||
    payload.detail ||
    payload.errors?.message ||
    payload.data?.message;

  if (typeof directMessage === "string" && directMessage.trim()) {
    return directMessage.trim();
  }

  return `PayChangu request failed (${fallbackStatus}).`;
}

function getPublicPayChanguMessage(message, statusCode) {
  const lower = String(message || "").toLowerCase();
  if (
    statusCode === 401 ||
    statusCode === 403 ||
    lower.includes("secret key") ||
    lower.includes("api key") ||
    lower.includes("unauthorized") ||
    lower.includes("unauthenticated")
  ) {
    return "PayChangu credentials are not configured correctly on the backend.";
  }

  return "PayChangu could not process the payment request. Please try again.";
}

function createPayChanguRequestError(endpoint, response, payload) {
  return new PayChanguRequestError(parsePayChanguError(payload, response.status), {
    endpoint,
    statusCode: response.status,
    payload,
  });
}

function redactText(value) {
  const text = String(value);
  if (!text) return text;
  if (text.includes("@")) {
    const [name, domain] = text.split("@");
    return `${name.slice(0, 2)}***@${domain || "***"}`;
  }
  if (/^\+?\d[\d\s().-]{5,}$/.test(text)) {
    const digits = text.replace(/[^\d]/g, "");
    return digits.length <= 4 ? "***" : `${"*".repeat(Math.max(0, digits.length - 4))}${digits.slice(-4)}`;
  }
  return text;
}

function redactPayload(value, seen = new Set()) {
  if (!value || typeof value !== "object") {
    return typeof value === "string" ? redactText(value) : value;
  }
  if (seen.has(value)) return "[Circular]";
  seen.add(value);

  if (Array.isArray(value)) return value.map((item) => redactPayload(item, seen));

  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => {
      if (/secret|token|authorization|password|key/i.test(key)) return [key, "[REDACTED]"];
      if (/email|mobile|phone|msisdn|account_number|account_no/i.test(key)) return [key, redactPayload(entry, seen)];
      return [key, redactPayload(entry, seen)];
    }),
  );
}

export function normalizePayChanguPaymentMethod(value) {
  const text = String(value || "").trim().toLowerCase();
  if (!text) return "";

  const compact = text.replace(/[\s-]+/g, "_");
  if (compact === "airtel_money" || compact.includes("airtel")) return "airtel_money";
  if (compact === "mpamba" || compact.includes("mpamba") || compact.includes("tnm")) return "mpamba";
  if (compact === "bank_transfer" || compact.includes("bank")) return "bank_transfer";
  return compact;
}

export function isDirectChargeMethod(method) {
  return method === "airtel_money" || method === "mpamba" || method === "bank_transfer";
}

export function getPayChanguClientErrorMessage(error, fallbackMessage) {
  if (error instanceof PayChanguConfigurationError || error instanceof PayChanguRequestError) {
    return error.publicMessage || fallbackMessage;
  }
  return error instanceof Error && error.message ? error.message : fallbackMessage;
}

export function getPayChanguClientStatus(error, fallbackStatus = 502) {
  if (error instanceof PayChanguConfigurationError) return error.statusCode;
  return fallbackStatus;
}

export function logPayChanguError(context, error, extra = {}) {
  const details = {
    context,
    name: error instanceof Error ? error.name : typeof error,
    message: error instanceof Error ? error.message : String(error),
    statusCode: error?.statusCode || null,
    endpoint: error?.endpoint || null,
    providerPayload: error?.payload ? redactPayload(error.payload) : null,
    ...redactPayload(extra),
  };
  console.error(`[${context}]`, JSON.stringify(details));
}

export function buildCheckoutPayload(input) {
  const txRef = typeof input.tx_ref === "string" && input.tx_ref.trim() ? input.tx_ref.trim() : `tx_${Date.now()}`;

  return {
    amount: Number(input.amount),
    currency: typeof input.currency === "string" ? input.currency : "MWK",
    email: input.email,
    first_name: input.first_name || undefined,
    last_name: input.last_name || undefined,
    tx_ref: txRef,
    callback_url: getSuccessUrl(),
    return_url: getCancelUrl(),
    customization: {
      title: input.title || "EYA payment",
      description: input.description || "Checkout payment",
    },
    meta: {
      project: input.project || "eya",
      ...(input.meta && typeof input.meta === "object" ? input.meta : {}),
    },
  };
}

function normalizeMobile(raw) {
  const digits = String(raw || "").replace(/[^\d]/g, "");
  if (!digits) return "";
  if (digits.startsWith("0")) return digits;
  if (digits.startsWith("265") && digits.length === 12) return `0${digits.slice(3)}`;
  if (digits.length === 9) return `0${digits}`;
  return digits;
}

function extractOperatorRows(payload) {
  const candidates = [payload?.data, payload?.data?.data, payload?.operators, payload];
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) return candidate;
  }
  return [];
}

function getOperatorRefId(row) {
  return row?.ref_id || row?.operator_ref_id || row?.uuid || row?.id || null;
}

function getOperatorName(row) {
  return String(row?.name || row?.operator_name || row?.provider || "").toLowerCase();
}

function isPlainObject(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function deepFindFirstObject(value, predicate, seen = new Set()) {
  if (!value || typeof value !== "object") return null;
  if (seen.has(value)) return null;
  seen.add(value);

  if (isPlainObject(value) && predicate(value)) {
    return value;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const match = deepFindFirstObject(item, predicate, seen);
      if (match) return match;
    }
    return null;
  }

  for (const child of Object.values(value)) {
    const match = deepFindFirstObject(child, predicate, seen);
    if (match) return match;
  }

  return null;
}

function deepFindFirstString(value, keys, seen = new Set()) {
  if (!value || typeof value !== "object") return null;
  if (seen.has(value)) return null;
  seen.add(value);

  if (isPlainObject(value)) {
    for (const [key, entry] of Object.entries(value)) {
      if (keys.includes(String(key).toLowerCase()) && typeof entry === "string" && entry.trim()) {
        return entry.trim();
      }
    }
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const match = deepFindFirstString(item, keys, seen);
      if (match) return match;
    }
    return null;
  }

  for (const child of Object.values(value)) {
    const match = deepFindFirstString(child, keys, seen);
    if (match) return match;
  }

  return null;
}

function redactBankDetailsPreview(details) {
  if (!isPlainObject(details)) return null;
  const preview = {};
  for (const [key, value] of Object.entries(details)) {
    if (value == null) {
      preview[key] = value;
      continue;
    }
    const text = String(value);
    if (/account_number|account_no|account|payment_code|code/i.test(key)) {
      preview[key] = text.length <= 4 ? text : `${"*".repeat(Math.max(0, text.length - 4))}${text.slice(-4)}`;
      continue;
    }
    preview[key] = text;
  }
  return preview;
}

async function fetchMobileMoneyOperators() {
  const endpoint = `${PAYCHANGU_API_BASE}/mobile-money`;
  const response = await fetch(endpoint, {
    method: "GET",
    headers: getAuthHeaders(),
  });

  const data = await readJson(response);
  if (!response.ok) {
    throw createPayChanguRequestError(endpoint, response, data);
  }

  return extractOperatorRows(data);
}

async function resolveMobileMoneyOperatorRefId(method) {
  const operators = await fetchMobileMoneyOperators();
  const needle = method === "airtel_money" ? "airtel" : "mpamba";
  const match = operators.find((row) => getOperatorName(row).includes(needle));
  const refId = getOperatorRefId(match);
  if (!refId) {
    throw new Error(`Could not resolve PayChangu operator for ${method}.`);
  }
  return refId;
}

function parseDirectChargeResponse(data, fallbackChargeId) {
  const root = data?.data || {};
  const transaction =
    root?.transaction ||
    root?.data?.transaction ||
    data?.transaction ||
    deepFindFirstObject(data, (candidate) =>
      ["charge_id", "ref_id", "status", "authorization"].some((key) => key in candidate),
    ) ||
    root;
  const paymentAccountDetails =
    root?.payment_account_details ||
    root?.data?.payment_account_details ||
    transaction?.payment_account_details ||
    data?.payment_account_details ||
    data?.data?.data?.payment_account_details ||
    deepFindFirstObject(data, (candidate) =>
      ["bank_name", "account_name", "account_number", "payment_code", "account_expiration_timestamp"].some((key) => key in candidate),
    ) ||
    null;
  const chargeId =
    transaction?.charge_id ||
    root?.charge_id ||
    deepFindFirstString(data, ["charge_id", "chargeid", "tx_ref", "txref"]) ||
    fallbackChargeId ||
    null;
  if (typeof chargeId !== "string" || !chargeId.trim()) {
    throw new Error("PayChangu did not return a valid charge ID.");
  }

  return {
    raw: data,
    chargeId: chargeId.trim(),
    providerReference:
      transaction?.ref_id ||
      root?.ref_id ||
      deepFindFirstString(data, ["ref_id", "reference", "provider_reference"]) ||
      null,
    status:
      transaction?.status ||
      root?.transaction?.status ||
      root?.data?.transaction?.status ||
      root?.status ||
      data?.status ||
      deepFindFirstString(data, ["status", "payment_status"]) ||
      "pending",
    paymentAccountDetails,
    authorization:
      transaction?.authorization ||
      root?.authorization ||
      deepFindFirstObject(data, (candidate) => "channel" in candidate || "authorization" in candidate) ||
      null,
  };
}

export async function createHostedCheckout(payload) {
  const endpoint = `${PAYCHANGU_API_BASE}/payment`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: getJsonHeaders(),
    body: JSON.stringify(payload),
  });

  const data = await readJson(response);

  if (!response.ok) {
    throw createPayChanguRequestError(endpoint, response, data);
  }

  const checkoutUrl = data?.data?.checkout_url;
  if (typeof checkoutUrl !== "string" || !/^https?:\/\//i.test(checkoutUrl)) {
    throw new Error("PayChangu did not return a valid checkout URL.");
  }

  return {
    raw: data,
    checkoutUrl,
    txRef: data?.data?.data?.tx_ref || payload.tx_ref,
  };
}

export async function createDirectCharge(input) {
  const method = normalizePayChanguPaymentMethod(input?.meta?.payment_method);
  if (method === "bank_transfer") {
    const payload = {
      payment_method: "mobile_bank_transfer",
      amount: String(Number(input.amount)),
      currency: typeof input.currency === "string" ? input.currency : "MWK",
      charge_id: input.tx_ref,
      create_permanent_account: false,
    };

    const endpoint = `${PAYCHANGU_API_BASE}/direct-charge/payments/initialize`;
    const response = await fetch(endpoint, {
      method: "POST",
      headers: getJsonHeaders(),
      body: JSON.stringify(payload),
    });
    const data = await readJson(response);
    if (!response.ok) {
      throw createPayChanguRequestError(endpoint, response, data);
    }
    const parsed = parseDirectChargeResponse(data, input.tx_ref);
    console.info("[paychangu] bank direct-charge response keys", {
      rootKeys: Object.keys(data?.data || {}),
      paymentAccountDetailKeys: Object.keys(
        parsed.paymentAccountDetails || {},
      ),
      transactionKeys: Object.keys(
        data?.data?.transaction ||
          data?.data?.data?.transaction ||
          data?.transaction ||
          {},
      ),
      paymentAccountDetailsPreview: redactBankDetailsPreview(parsed.paymentAccountDetails),
    });
    return parsed;
  }

  if (method === "airtel_money" || method === "mpamba") {
    const operatorRefId = await resolveMobileMoneyOperatorRefId(method);
    const payload = {
      amount: String(Number(input.amount)),
      currency: typeof input.currency === "string" ? input.currency : "MWK",
      mobile: normalizeMobile(input?.meta?.msisdn),
      mobile_money_operator_ref_id: operatorRefId,
      charge_id: input.tx_ref,
      email: input.email || undefined,
      first_name: input.first_name || undefined,
      last_name: input.last_name || undefined,
    };

    if (!payload.mobile) {
      throw new Error("A valid mobile money number is required.");
    }

    const endpoint = `${PAYCHANGU_API_BASE}/mobile-money/payments/initialize`;
    const response = await fetch(endpoint, {
      method: "POST",
      headers: getJsonHeaders(),
      body: JSON.stringify(payload),
    });
    const data = await readJson(response);
    if (!response.ok) {
      throw createPayChanguRequestError(endpoint, response, data);
    }
    return parseDirectChargeResponse(data, input.tx_ref);
  }

  throw new Error(`Direct charge is not configured for method: ${String(method || "unknown")}.`);
}

export async function verifyTransaction(txRef) {
  const endpoint = `${PAYCHANGU_API_BASE}/verify-payment/${encodeURIComponent(txRef)}`;
  const response = await fetch(endpoint, {
    method: "GET",
    headers: getAuthHeaders(),
  });

  const data = await readJson(response);

  if (!response.ok) {
    throw createPayChanguRequestError(endpoint, response, data);
  }

  return data;
}

export async function verifyDirectCharge(txRef, method) {
  const isBank = method === "bank_transfer";
  const endpoint = isBank
    ? `${PAYCHANGU_API_BASE}/direct-charge/transactions/${encodeURIComponent(txRef)}/details`
    : `${PAYCHANGU_API_BASE}/mobile-money/payments/${encodeURIComponent(txRef)}/verify`;

  const response = await fetch(endpoint, {
    method: "GET",
    headers: getAuthHeaders(),
  });

  const data = await readJson(response);

  if (!response.ok) {
    throw createPayChanguRequestError(endpoint, response, data);
  }

  return data;
}

export function verifyWebhookSignature(rawBody, signature) {
  if (!config.paychanguWebhookSecret) return true;
  if (!signature) return false;

  const digest = crypto.createHmac("sha256", config.paychanguWebhookSecret).update(rawBody).digest("hex");
  const normalizedSignature = String(signature).trim().toLowerCase();

  // timingSafeEqual throws when buffer lengths differ, so reject malformed inputs first.
  if (!/^[0-9a-f]+$/i.test(normalizedSignature)) return false;

  const expected = Buffer.from(digest, "hex");
  const received = Buffer.from(normalizedSignature, "hex");

  if (expected.length !== received.length) return false;

  return crypto.timingSafeEqual(expected, received);
}
