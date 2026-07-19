import type { PaymentIntentRecord, PaymentsEnv } from "./ledger";

const DEFAULT_PAYCHANGU_API_BASE_URL = "https://api.paychangu.com";
const REQUEST_TIMEOUT_MS = 15_000;

type JsonObject = Record<string, unknown>;

type PayChanguCheckoutPayload = {
  status?: unknown;
  message?: unknown;
  data?: unknown;
};

export class PaymentProviderError extends Error {
  readonly providerStatusCode: number | null;
  readonly providerPayload: unknown;

  constructor(message: string, providerStatusCode: number | null, providerPayload: unknown) {
    super(message);
    this.name = "PaymentProviderError";
    this.providerStatusCode = providerStatusCode;
    this.providerPayload = providerPayload;
  }
}

export type PayChanguCheckoutResult = {
  checkoutUrl: string;
  providerReference: string;
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

function validateHttpsUrl(value: string, name: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${name} must be a valid URL.`);
  }

  if (url.protocol !== "https:") {
    throw new Error(`${name} must use HTTPS.`);
  }

  return url.toString();
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

function extractCheckoutResult(
  payload: PayChanguCheckoutPayload,
  expectedReference: string,
  expectedAmountMwk: number,
): PayChanguCheckoutResult {
  const root = asObject(payload);
  const outerData = asObject(root?.data);
  const transaction = asObject(outerData?.data);

  const status = asNonEmptyString(root?.status);
  const checkoutUrlValue = asNonEmptyString(outerData?.checkout_url);
  const providerReference = asNonEmptyString(transaction?.tx_ref);
  const currency = asNonEmptyString(transaction?.currency);
  const transactionStatus = asNonEmptyString(transaction?.status);
  const amount = Number(transaction?.amount);

  if (status !== "success") {
    throw new PaymentProviderError(
      asNonEmptyString(root?.message) || "PayChangu did not create a checkout session.",
      200,
      root || {},
    );
  }

  if (!checkoutUrlValue) {
    throw new PaymentProviderError("PayChangu response did not include a checkout URL.", 200, root || {});
  }

  let checkoutUrl: string;
  try {
    checkoutUrl = validateHttpsUrl(checkoutUrlValue, "PayChangu checkout URL");
  } catch {
    throw new PaymentProviderError("PayChangu returned an invalid checkout URL.", 200, root || {});
  }

  if (providerReference !== expectedReference) {
    throw new PaymentProviderError("PayChangu returned an unexpected transaction reference.", 200, root || {});
  }

  if (currency !== "MWK") {
    throw new PaymentProviderError("PayChangu returned an unexpected currency.", 200, root || {});
  }

  if (!Number.isSafeInteger(amount) || amount !== expectedAmountMwk) {
    throw new PaymentProviderError("PayChangu returned an unexpected checkout amount.", 200, root || {});
  }

  if (transactionStatus !== "pending") {
    throw new PaymentProviderError("PayChangu checkout was not created in a pending state.", 200, root || {});
  }

  return {
    checkoutUrl,
    providerReference,
    providerPayload: root || {},
  };
}

export async function initiatePayChanguCheckout(
  env: PaymentsEnv,
  intent: PaymentIntentRecord,
): Promise<PayChanguCheckoutResult> {
  const secretKey = requiredConfig(env.PAYCHANGU_SECRET_KEY, "PAYCHANGU_SECRET_KEY");
  const callbackUrl = validateHttpsUrl(
    requiredConfig(env.PAYCHANGU_CALLBACK_URL, "PAYCHANGU_CALLBACK_URL"),
    "PAYCHANGU_CALLBACK_URL",
  );
  const returnUrl = validateHttpsUrl(
    requiredConfig(env.PAYCHANGU_RETURN_URL, "PAYCHANGU_RETURN_URL"),
    "PAYCHANGU_RETURN_URL",
  );
  const apiBaseUrl = normalizeApiBaseUrl(env.PAYCHANGU_API_BASE_URL);

  const requestBody: JsonObject = {
    amount: intent.expected_amount_mwk,
    currency: "MWK",
    tx_ref: intent.merchant_reference,
    callback_url: callbackUrl,
    return_url: returnUrl,
    email: intent.customer_email,
    customization: {
      title: intent.title || "VAC payment",
      description: intent.description || intent.purpose,
    },
    meta: {
      payment_intent_id: intent.id,
      app_id: intent.app_id,
      app_payment_id: intent.app_payment_id,
      purpose: intent.purpose,
      requested_method: intent.method,
    },
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(`${apiBaseUrl}/payment`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${secretKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
      signal: controller.signal,
    });
  } catch (error) {
    const timedOut = error instanceof DOMException && error.name === "AbortError";
    throw new PaymentProviderError(
      timedOut ? "PayChangu checkout request timed out." : "Could not reach PayChangu.",
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
      asNonEmptyString(providerPayload.message) || "PayChangu rejected the checkout request.",
      response.status,
      providerPayload,
    );
  }

  return extractCheckoutResult(
    providerPayload,
    intent.merchant_reference,
    intent.expected_amount_mwk,
  );
}
