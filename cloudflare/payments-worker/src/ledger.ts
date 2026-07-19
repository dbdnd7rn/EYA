export type PaymentsEnv = {
  ENVIRONMENT: string;
  PAYCHANGU_SECRET_KEY: string;
  PAYCHANGU_WEBHOOK_SECRET: string;
  PAYMENTS_SUPABASE_URL: string;
  PAYMENTS_SUPABASE_SERVICE_ROLE_KEY: string;
  APP_SECRETS_JSON: string;
};

export type CreatePaymentIntentInput = {
  appId: string;
  appPaymentId: string;
  appUserId?: string | null;
  purpose: string;
  method: "airtel_money" | "mpamba" | "bank_transfer";
  amountMwk: number;
  customerEmail: string;
  customerPhone?: string | null;
  title?: string | null;
  description?: string | null;
  metadata?: Record<string, unknown>;
};

export type PaymentIntentRecord = {
  id: string;
  app_id: string;
  app_payment_id: string;
  app_user_id: string | null;
  purpose: string;
  method: string;
  merchant_reference: string;
  provider_reference: string | null;
  expected_amount_mwk: number;
  paid_amount_mwk: number | null;
  currency: "MWK";
  status: string;
  customer_email: string | null;
  customer_phone: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

function normalizeBaseUrl(value: string): string {
  return value.trim().replace(/\/+$/, "");
}

function restHeaders(env: PaymentsEnv, prefer?: string): HeadersInit {
  const headers: Record<string, string> = {
    apikey: env.PAYMENTS_SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${env.PAYMENTS_SUPABASE_SERVICE_ROLE_KEY}`,
    "Content-Type": "application/json",
  };
  if (prefer) headers.Prefer = prefer;
  return headers;
}

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

function providerError(payload: unknown, status: number): string {
  if (payload && typeof payload === "object" && !Array.isArray(payload)) {
    const value = payload as Record<string, unknown>;
    const message = value.message || value.error || value.details || value.hint;
    if (typeof message === "string" && message.trim()) return message.trim();
  }
  return `Payment ledger request failed (${status}).`;
}

export function createMerchantReference(appId: string): string {
  const safeAppId = appId.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 12) || "app";
  const random = crypto.randomUUID().replace(/-/g, "").slice(0, 20);
  return `${safeAppId}_${Date.now()}_${random}`;
}

export async function findPaymentIntent(
  env: PaymentsEnv,
  appId: string,
  appPaymentId: string,
): Promise<PaymentIntentRecord | null> {
  const baseUrl = normalizeBaseUrl(env.PAYMENTS_SUPABASE_URL);
  const params = new URLSearchParams({
    select: "*",
    app_id: `eq.${appId}`,
    app_payment_id: `eq.${appPaymentId}`,
    limit: "1",
  });
  const response = await fetch(`${baseUrl}/rest/v1/payment_intents?${params}`, {
    headers: restHeaders(env),
  });
  const payload = await readJson(response);
  if (!response.ok) throw new Error(providerError(payload, response.status));
  return Array.isArray(payload) && payload.length ? (payload[0] as PaymentIntentRecord) : null;
}

export async function createPaymentIntent(
  env: PaymentsEnv,
  input: CreatePaymentIntentInput,
): Promise<{ intent: PaymentIntentRecord; created: boolean }> {
  const existing = await findPaymentIntent(env, input.appId, input.appPaymentId);
  if (existing) {
    if (
      Number(existing.expected_amount_mwk) !== input.amountMwk ||
      existing.method !== input.method ||
      existing.purpose !== input.purpose
    ) {
      throw new Error("The supplied app payment id already belongs to a different payment request.");
    }
    return { intent: existing, created: false };
  }

  const row = {
    app_id: input.appId,
    app_payment_id: input.appPaymentId,
    app_user_id: input.appUserId || null,
    purpose: input.purpose,
    provider: "paychangu",
    method: input.method,
    merchant_reference: createMerchantReference(input.appId),
    expected_amount_mwk: input.amountMwk,
    currency: "MWK",
    status: "created",
    customer_email: input.customerEmail,
    customer_phone: input.customerPhone || null,
    title: input.title || null,
    description: input.description || null,
    metadata: input.metadata || {},
  };

  const baseUrl = normalizeBaseUrl(env.PAYMENTS_SUPABASE_URL);
  const response = await fetch(`${baseUrl}/rest/v1/payment_intents`, {
    method: "POST",
    headers: restHeaders(env, "return=representation"),
    body: JSON.stringify(row),
  });
  const payload = await readJson(response);

  if (response.status === 409) {
    const concurrent = await findPaymentIntent(env, input.appId, input.appPaymentId);
    if (concurrent) return { intent: concurrent, created: false };
  }

  if (!response.ok) throw new Error(providerError(payload, response.status));
  if (!Array.isArray(payload) || !payload[0]) {
    throw new Error("Payment ledger did not return the created intent.");
  }

  return { intent: payload[0] as PaymentIntentRecord, created: true };
}
