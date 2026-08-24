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

function nowIso(): string {
  return new Date().toISOString();
}

function paymentIntentId(): string {
  return `pay_${crypto.randomUUID()}`;
}

function merchantReference(appId: string): string {
  return `vac_${appId.replace(/[^a-zA-Z0-9_-]/g, "_")}_${crypto.randomUUID()}`;
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
    const intent = mapPaymentIntent(existing);
    if (intent.expected_amount_minor !== input.amountMinor || intent.currency !== input.currency) {
      throw new Error("An existing payment intent has a different amount or currency.");
    }
    if (intent.method !== input.method || intent.purpose !== input.purpose) {
      throw new Error("An existing payment intent has different payment parameters.");
    }
    return { intent, created: false };
  }

  const id = paymentIntentId();
  const reference = merchantReference(input.appId);
  const now = nowIso();
  const amountMwk = input.currency === "MWK" ? input.amountMinor : null;

  await env.PAYMENTS_DB.prepare(
    `insert into payment_intents (
      id, app_id, app_payment_id, app_user_id, purpose, provider, method,
      merchant_reference, expected_amount_mwk, expected_amount_minor, currency,
      status, customer_email, customer_phone, title, description, metadata_json,
      provider_payload_json, created_at, updated_at
    ) values (
      ?1, ?2, ?3, ?4, ?5, 'paychangu', ?6,
      ?7, ?8, ?9, ?10,
      'created', ?11, ?12, ?13, ?14, ?15,
      '{}', ?16, ?16
    )`,
  )
    .bind(
      id,
      input.appId,
      input.appPaymentId,
      input.appUserId || null,
      input.purpose,
      input.method,
      reference,
      amountMwk,
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

  const inserted = await env.PAYMENTS_DB.prepare(`select * from payment_intents where id = ?1`)
    .bind(id)
    .first<PaymentIntentRow>();
  if (!inserted) throw new Error("Payment intent could not be created.");
  return { intent: mapPaymentIntent(inserted), created: true };
}

export async function savePayChanguCheckout(
  env: PaymentsEnv,
  intent: PaymentIntentRecord,
  checkout: { checkoutUrl: string; providerReference: string; providerPayload: Record<string, unknown> },
): Promise<PaymentIntentRecord> {
  const now = nowIso();
  await env.PAYMENTS_DB.prepare(
    `update payment_intents
     set provider_reference = ?1,
         checkout_url = ?2,
         provider_payload_json = ?3,
         status = 'pending',
         updated_at = ?4
     where id = ?5`,
  )
    .bind(
      checkout.providerReference,
      checkout.checkoutUrl,
      JSON.stringify(checkout.providerPayload || {}),
      now,
      intent.id,
    )
    .run();

  const updated = await env.PAYMENTS_DB.prepare(`select * from payment_intents where id = ?1`)
    .bind(intent.id)
    .first<PaymentIntentRow>();
  if (!updated) throw new Error("Payment intent could not be updated after checkout creation.");
  return mapPaymentIntent(updated);
}

export async function savePayChanguDirectCharge(
  env: PaymentsEnv,
  intent: PaymentIntentRecord,
  charge: { providerReference: string; providerPayload: Record<string, unknown>; status: string },
): Promise<PaymentIntentRecord> {
  const now = nowIso();
  await env.PAYMENTS_DB.prepare(
    `update payment_intents
     set provider_reference = ?1,
         provider_payload_json = ?2,
         status = ?3,
         updated_at = ?4
     where id = ?5`,
  )
    .bind(charge.providerReference, JSON.stringify(charge.providerPayload || {}), charge.status, now, intent.id)
    .run();

  const updated = await env.PAYMENTS_DB.prepare(`select * from payment_intents where id = ?1`)
    .bind(intent.id)
    .first<PaymentIntentRow>();
  if (!updated) throw new Error("Payment intent could not be updated after direct charge creation.");
  return mapPaymentIntent(updated);
}

export async function recordPaymentProviderFailure(
  env: PaymentsEnv,
  paymentIntentId: string,
  failureReason: string,
  providerPayload: unknown,
): Promise<void> {
  await env.PAYMENTS_DB.prepare(
    `update payment_intents
     set failure_reason = ?1,
         provider_payload_json = ?2,
         updated_at = ?3
     where id = ?4`,
  )
    .bind(failureReason, JSON.stringify(providerPayload || {}), nowIso(), paymentIntentId)
    .run();
}
