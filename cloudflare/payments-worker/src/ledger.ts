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
  batch(statements: D1PreparedStatementLike[]): Promise<D1RunResult[]>;
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
  APP_RETURN_URLS_JSON?: string;
  ONLINE_TOURISM_APP_SECRET?: string;
  ONLINE_TOURISM_CALLBACK_URL?: string;
  PAYMENTS_DB: D1DatabaseLike;
};

export type PaymentCurrency = "MWK" | "USD";
export type PaymentMethod = "airtel_money" | "mpamba" | "bank_transfer" | "card" | "hosted_checkout";

export type CreatePaymentIntentInput = {
  appId: string;
  appPaymentId: string;
  appUserId?: string | null;
  purpose: string;
  method: PaymentMethod;
  currency: PaymentCurrency;
  amountMinor: number;
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
  expected_amount_mwk: number | null;
  paid_amount_mwk: number | null;
  expected_amount_minor: number;
  paid_amount_minor: number | null;
  currency: PaymentCurrency;
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
  // Legacy EYA direct-charge helpers still read this field. It is 0 for USD
  // hosted-checkout intents and must never be used as generic payment truth.
  expected_amount_mwk: number;
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

function mapPaymentIntent(row: PaymentIntentRow): PaymentIntentRecord {
  const { metadata_json: metadataJson, provider_payload_json: providerPayloadJson, ...rest } = row;
  return {
    ...rest,
    expected_amount_mwk: rest.expected_amount_mwk == null ? 0 : Number(rest.expected_amount_mwk),
    paid_amount_mwk: rest.paid_amount_mwk == null ? null : Number(rest.paid_amount_mwk),
    expected_amount_minor: Number(rest.expected_amount_minor),
    paid_amount_minor: rest.paid_amount_minor == null ? null : Number(rest.paid_amount_minor),
    metadata: parseJsonObject(metadataJson),
    provider_payload: parseJsonObject(providerPayloadJson),
  };
}

export function createMerchantReference(appId: string): string {
  const safeAppId = appId.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 12) || "app";
  const random = crypto.randomUUID().replace(/-/g, "").slice(0, 20);
  return `${safeAppId}_${Date.now()}_${random}`;
}

const PAYMENT_INTENT_SELECT = `select
   id,
   app_id,
   app_payment_id,
   app_user_id,
   purpose,
   provider,
   method,
   merchant_reference,
   provider_reference,
   expected_amount_mwk,
   paid_amount_mwk,
   expected_amount_minor,
   paid_amount_minor,
   currency,
   status,
   customer_email,
   customer_phone,
   title,
   description,
   metadata_json,
   provider_payload_json,
   checkout_url,
   failure_reason,
   created_at,
   updated_at
 from payment_intents`;

export async function findPaymentIntent(
  env: PaymentsEnv,
  appId: string,
  appPaymentId: string,
): Promise<PaymentIntentRecord | null> {
  const row = await env.PAYMENTS_DB.prepare(
    `${PAYMENT_INTENT_SELECT}
     where app_id = ?1 and app_payment_id = ?2
     limit 1`,
  )
    .bind(appId, appPaymentId)
    .first<PaymentIntentRow>();
  return row ? mapPaymentIntent(row) : null;
}

async function findPaymentIntentById(env: PaymentsEnv, id: string): Promise<PaymentIntentRecord | null> {
  const row = await env.PAYMENTS_DB.prepare(
    `${PAYMENT_INTENT_SELECT}
     where id = ?1
     limit 1`,
  )
    .bind(id)
    .first<PaymentIntentRow>();
  return row ? mapPaymentIntent(row) : null;
}

function assertIdempotentMatch(existing: PaymentIntentRecord, input: CreatePaymentIntentInput): void {
  if (
    Number(existing.expected_amount_minor) !== input.amountMinor ||
    existing.currency !== input.currency ||
    existing.method !== input.method ||
    existing.purpose !== input.purpose ||
    existing.app_user_id !== (input.appUserId || null)
  ) {
    throw new Error("The supplied app payment id already belongs to a different payment request.");
  }
}

export async function createPaymentIntent(
  env: PaymentsEnv,
  input: CreatePaymentIntentInput,
): Promise<{ intent: PaymentIntentRecord; created: boolean }> {
  const existing = await findPaymentIntent(env, input.appId, input.appPaymentId);
  if (existing) {
    assertIdempotentMatch(existing, input);
    return { intent: existing, created: false };
  }

  const id = crypto.randomUUID();
  const merchantReference = createMerchantReference(input.appId);
  const now = new Date().toISOString();
  const legacyExpectedAmountMwk = input.currency === "MWK" ? input.amountMinor : null;
  const result = await env.PAYMENTS_DB.prepare(
    `insert or ignore into payment_intents (
       id, app_id, app_payment_id, app_user_id, purpose, provider, method,
       merchant_reference, expected_amount_mwk, expected_amount_minor, currency, status,
       customer_email, customer_phone, title, description, metadata_json,
       created_at, updated_at
     ) values (
       ?1, ?2, ?3, ?4, ?5, 'paychangu', ?6, ?7, ?8, ?9, ?10, 'created',
       ?11, ?12, ?13, ?14, ?15, ?16, ?16
     )`,
  )
    .bind(
      id,
      input.appId,
      input.appPaymentId,
      input.appUserId || null,
      input.purpose,
      input.method,
      merchantReference,
      legacyExpectedAmountMwk,
      input.amountMinor,
      input.currency,
      input.customerEmail,
      input.customerPhone || null,
      input.title || null,
      input.description || null,
      JSON.stringify(input.metadata || {}),
      now,
    )
    .run();

  if (!result.success) throw new Error("D1 could not create the payment intent.");
  const intent = await findPaymentIntent(env, input.appId, input.appPaymentId);
  if (!intent) throw new Error("D1 did not return the payment intent after creation.");
  if ((result.meta?.changes || 0) === 0) {
    assertIdempotentMatch(intent, input);
    return { intent, created: false };
  }
  return { intent, created: true };
}

export async function savePayChanguCheckout(
  env: PaymentsEnv,
  intent: PaymentIntentRecord,
  checkout: { checkoutUrl: string; providerReference: string; providerPayload: Record<string, unknown> },
): Promise<PaymentIntentRecord> {
  if (intent.checkout_url || intent.provider_reference) {
    if (intent.checkout_url !== checkout.checkoutUrl || intent.provider_reference !== checkout.providerReference) {
      throw new Error("The payment intent already has a different provider checkout session.");
    }
    return intent;
  }

  const now = new Date().toISOString();
  const result = await env.PAYMENTS_DB.prepare(
    `update payment_intents
     set provider_reference = ?2,
         checkout_url = ?3,
         provider_payload_json = ?4,
         status = 'pending',
         failure_reason = null,
         updated_at = ?5
     where id = ?1
       and merchant_reference = ?6
       and provider_reference is null
       and checkout_url is null
       and status = 'created'`,
  )
    .bind(intent.id, checkout.providerReference, checkout.checkoutUrl, JSON.stringify(checkout.providerPayload), now, intent.merchant_reference)
    .run();

  if (!result.success) throw new Error("D1 could not store the PayChangu checkout session.");
  const stored = await findPaymentIntentById(env, intent.id);
  if (!stored) throw new Error("D1 did not return the payment intent after checkout creation.");
  if (stored.checkout_url !== checkout.checkoutUrl || stored.provider_reference !== checkout.providerReference) {
    throw new Error("The payment intent checkout session conflicts with the stored provider session.");
  }
  return stored;
}

export async function savePayChanguDirectCharge(
  env: PaymentsEnv,
  intent: PaymentIntentRecord,
  charge: { providerReference: string; providerPayload: Record<string, unknown> },
): Promise<PaymentIntentRecord> {
  if (intent.provider_reference) {
    if (intent.provider_reference !== charge.providerReference) {
      throw new Error("The payment intent already has a different direct charge session.");
    }
    return intent;
  }

  const now = new Date().toISOString();
  const result = await env.PAYMENTS_DB.prepare(
    `update payment_intents
     set provider_reference = ?2,
         provider_payload_json = ?3,
         status = 'pending',
         failure_reason = null,
         updated_at = ?4
     where id = ?1
       and merchant_reference = ?5
       and provider_reference is null
       and checkout_url is null
       and status = 'created'`,
  )
    .bind(intent.id, charge.providerReference, JSON.stringify(charge.providerPayload), now, intent.merchant_reference)
    .run();

  if (!result.success) throw new Error("D1 could not store the PayChangu direct charge session.");
  const stored = await findPaymentIntentById(env, intent.id);
  if (!stored) throw new Error("D1 did not return the payment intent after direct charge creation.");
  if (stored.provider_reference !== charge.providerReference || stored.checkout_url) {
    throw new Error("The payment intent direct charge session conflicts with the stored provider session.");
  }
  return stored;
}

export async function recordPaymentProviderFailure(
  env: PaymentsEnv,
  intentId: string,
  reason: string,
  providerPayload: unknown,
): Promise<void> {
  const payload = providerPayload && typeof providerPayload === "object" && !Array.isArray(providerPayload)
    ? providerPayload
    : {};
  const now = new Date().toISOString();
  await env.PAYMENTS_DB.prepare(
    `update payment_intents
     set failure_reason = ?2,
         provider_payload_json = ?3,
         updated_at = ?4
     where id = ?1
       and provider_reference is null
       and checkout_url is null
       and status = 'created'`,
  )
    .bind(intentId, reason.slice(0, 1000), JSON.stringify(payload), now)
    .run();
}
