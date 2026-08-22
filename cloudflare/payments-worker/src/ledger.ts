export type D1RunResult = {
  success: boolean;
  meta?: { changes?: number };
};

export type D1PreparedStatementLike = {
  bind(...values: unknown[]): D1PreparedStatementLike;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  run(): Promise<D1RunResult>;
};

export type D1DatabaseLike = {
  prepare(query: string): D1PreparedStatementLike;
  batch(statements: D1PreparedStatementLike[]): Promise<unknown>;
};

export type PaymentsEnv = {
  ENVIRONMENT: string;
  PAYCHANGU_SECRET_KEY: string;
  PAYCHANGU_WEBHOOK_SECRET: string;
  PAYCHANGU_API_BASE_URL?: string;
  PAYCHANGU_CALLBACK_URL?: string;
  PAYCHANGU_RETURN_URL?: string;
  APP_SECRETS_JSON: string;
  APP_CALLBACKS_JSON?: string;
  PAYMENTS_DB: D1DatabaseLike;
};

export type PaymentMethod = "airtel_money" | "mpamba" | "bank_transfer" | "card";

export type CreatePaymentIntentInput = {
  appId: string;
  appPaymentId: string;
  appUserId?: string | null;
  purpose: string;
  method: PaymentMethod;
  amountMwk: number;
  customerEmail: string;
  customerPhone?: string | null;
  title?: string | null;
  description?: string | null;
  metadata?: Record<string, unknown>;
};

type PaymentIntentRow = {
  id: string;
  app_id: string;
  app_payment_id: string;
  app_user_id: string | null;
  purpose: string;
  provider: string;
  method: string;
  merchant_reference: string;
  provider_reference: string | null;
  expected_amount_mwk: number;
  paid_amount_mwk: number | null;
  currency: "MWK";
  status: string;
  customer_email: string | null;
  customer_phone: string | null;
  title: string | null;
  description: string | null;
  metadata_json: string;
  provider_payload_json: string;
  checkout_url: string | null;
  failure_reason: string | null;
  created_at: string;
  updated_at: string;
};

export type PaymentIntentRecord = Omit<PaymentIntentRow, "metadata_json" | "provider_payload_json"> & {
  metadata: Record<string, unknown>;
  provider_payload: Record<string, unknown>;
};

function parseJsonObject(value: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(value || "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function readIntent(row: PaymentIntentRow): PaymentIntentRecord {
  return {
    ...row,
    metadata: parseJsonObject(row.metadata_json),
    provider_payload: parseJsonObject(row.provider_payload_json),
  };
}

function makeId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, "")}`;
}

function makeMerchantReference(): string {
  return `VAC-${Date.now()}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
}

export async function createPaymentIntent(
  env: PaymentsEnv,
  input: CreatePaymentIntentInput,
): Promise<{ intent: PaymentIntentRecord; created: boolean }> {
  const existing = await env.PAYMENTS_DB.prepare(
    `select * from payment_intents where app_id = ?1 and app_payment_id = ?2 limit 1`,
  )
    .bind(input.appId, input.appPaymentId)
    .first<PaymentIntentRow>();

  if (existing) {
    const intent = readIntent(existing);
    if (
      intent.purpose !== input.purpose ||
      intent.method !== input.method ||
      intent.expected_amount_mwk !== input.amountMwk ||
      intent.currency !== "MWK"
    ) {
      throw new Error("A different payment request already exists for this application payment id.");
    }
    return { intent, created: false };
  }

  const now = new Date().toISOString();
  const row: PaymentIntentRow = {
    id: makeId("pay"),
    app_id: input.appId,
    app_payment_id: input.appPaymentId,
    app_user_id: input.appUserId || null,
    purpose: input.purpose,
    provider: "paychangu",
    method: input.method,
    merchant_reference: makeMerchantReference(),
    provider_reference: null,
    expected_amount_mwk: input.amountMwk,
    paid_amount_mwk: null,
    currency: "MWK",
    status: "created",
    customer_email: input.customerEmail,
    customer_phone: input.customerPhone || null,
    title: input.title || null,
    description: input.description || null,
    metadata_json: JSON.stringify(input.metadata || {}),
    provider_payload_json: "{}",
    checkout_url: null,
    failure_reason: null,
    created_at: now,
    updated_at: now,
  };

  const result = await env.PAYMENTS_DB.prepare(
    `insert into payment_intents (
      id, app_id, app_payment_id, app_user_id, purpose, provider, method,
      merchant_reference, provider_reference, expected_amount_mwk, paid_amount_mwk,
      currency, status, customer_email, customer_phone, title, description,
      metadata_json, provider_payload_json, checkout_url, failure_reason, created_at, updated_at
    ) values (
      ?1, ?2, ?3, ?4, ?5, ?6, ?7,
      ?8, ?9, ?10, ?11,
      ?12, ?13, ?14, ?15, ?16, ?17,
      ?18, ?19, ?20, ?21, ?22, ?23
    )`,
  )
    .bind(
      row.id,
      row.app_id,
      row.app_payment_id,
      row.app_user_id,
      row.purpose,
      row.provider,
      row.method,
      row.merchant_reference,
      row.provider_reference,
      row.expected_amount_mwk,
      row.paid_amount_mwk,
      row.currency,
      row.status,
      row.customer_email,
      row.customer_phone,
      row.title,
      row.description,
      row.metadata_json,
      row.provider_payload_json,
      row.checkout_url,
      row.failure_reason,
      row.created_at,
      row.updated_at,
    )
    .run();

  if (!result.success) throw new Error("D1 could not create the payment intent.");
  return { intent: readIntent(row), created: true };
}

export async function savePayChanguCheckout(
  env: PaymentsEnv,
  intent: PaymentIntentRecord,
  checkout: { checkoutUrl: string; providerPayload: unknown },
): Promise<PaymentIntentRecord> {
  const now = new Date().toISOString();
  const providerPayloadJson = JSON.stringify(checkout.providerPayload || {});
  const result = await env.PAYMENTS_DB.prepare(
    `update payment_intents
     set status = 'pending', checkout_url = ?2, provider_payload_json = ?3,
         failure_reason = null, updated_at = ?4
     where id = ?1 and status in ('created', 'pending')`,
  )
    .bind(intent.id, checkout.checkoutUrl, providerPayloadJson, now)
    .run();

  if (!result.success) throw new Error("D1 could not persist PayChangu checkout state.");
  return {
    ...intent,
    status: "pending",
    checkout_url: checkout.checkoutUrl,
    provider_payload: parseJsonObject(providerPayloadJson),
    failure_reason: null,
    updated_at: now,
  };
}

export async function savePayChanguDirectCharge(
  env: PaymentsEnv,
  intent: PaymentIntentRecord,
  charge: {
    providerReference: string | null;
    providerStatus: string;
    providerPayload: unknown;
  },
): Promise<PaymentIntentRecord> {
  const now = new Date().toISOString();
  const providerPayloadJson = JSON.stringify(charge.providerPayload || {});
  const providerReference = charge.providerReference || intent.provider_reference;
  const result = await env.PAYMENTS_DB.prepare(
    `update payment_intents
     set status = ?2,
         provider_reference = ?3,
         checkout_url = null,
         provider_payload_json = ?4,
         failure_reason = null,
         updated_at = ?5
     where id = ?1 and status in ('created', 'pending')`,
  )
    .bind(intent.id, charge.providerStatus, providerReference, providerPayloadJson, now)
    .run();

  if (!result.success) throw new Error("D1 could not persist PayChangu direct-charge state.");
  return {
    ...intent,
    status: charge.providerStatus,
    provider_reference: providerReference,
    checkout_url: null,
    provider_payload: parseJsonObject(providerPayloadJson),
    failure_reason: null,
    updated_at: now,
  };
}

export async function recordPaymentProviderFailure(
  env: PaymentsEnv,
  paymentIntentId: string,
  message: string,
  providerPayload?: unknown,
): Promise<void> {
  const now = new Date().toISOString();
  const providerPayloadJson = JSON.stringify(providerPayload || {});
  const result = await env.PAYMENTS_DB.prepare(
    `update payment_intents
     set failure_reason = ?2,
         provider_payload_json = ?3,
         updated_at = ?4
     where id = ?1`,
  )
    .bind(paymentIntentId, message.slice(0, 1000), providerPayloadJson, now)
    .run();

  if (!result.success) throw new Error("D1 could not record provider failure state.");
}

export async function getPaymentIntentByMerchantReference(
  env: PaymentsEnv,
  merchantReference: string,
): Promise<PaymentIntentRecord | null> {
  const row = await env.PAYMENTS_DB.prepare(
    `select * from payment_intents where merchant_reference = ?1 limit 1`,
  )
    .bind(merchantReference)
    .first<PaymentIntentRow>();
  return row ? readIntent(row) : null;
}

export async function getPaymentIntentByProviderReference(
  env: PaymentsEnv,
  providerReference: string,
): Promise<PaymentIntentRecord | null> {
  const row = await env.PAYMENTS_DB.prepare(
    `select * from payment_intents where provider_reference = ?1 limit 1`,
  )
    .bind(providerReference)
    .first<PaymentIntentRow>();
  return row ? readIntent(row) : null;
}

export async function updatePaymentVerification(
  env: PaymentsEnv,
  input: {
    id: string;
    status: string;
    paidAmountMwk: number | null;
    providerReference: string | null;
    providerPayload: unknown;
    failureReason?: string | null;
  },
): Promise<void> {
  const now = new Date().toISOString();
  const providerPayloadJson = JSON.stringify(input.providerPayload || {});
  const result = await env.PAYMENTS_DB.prepare(
    `update payment_intents
     set status = ?2,
         paid_amount_mwk = ?3,
         provider_reference = coalesce(?4, provider_reference),
         provider_payload_json = ?5,
         failure_reason = ?6,
         updated_at = ?7
     where id = ?1`,
  )
    .bind(
      input.id,
      input.status,
      input.paidAmountMwk,
      input.providerReference,
      providerPayloadJson,
      input.failureReason || null,
      now,
    )
    .run();

  if (!result.success) throw new Error("D1 could not persist payment verification state.");
}
