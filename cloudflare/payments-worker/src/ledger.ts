export type D1RunResult = {
  success: boolean;
  meta?: {
    changes?: number;
  };
};

export type D1PreparedStatementLike = {
  bind(...values: unknown[]): D1PreparedStatementLike;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  run(): Promise<D1RunResult>;
};

export type D1DatabaseLike = {
  prepare(query: string): D1PreparedStatementLike;
};

export type PaymentsEnv = {
  ENVIRONMENT: string;
  PAYCHANGU_SECRET_KEY: string;
  PAYCHANGU_WEBHOOK_SECRET: string;
  APP_SECRETS_JSON: string;
  PAYMENTS_DB: D1DatabaseLike;
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
  created_at: string;
  updated_at: string;
};

export type PaymentIntentRecord = Omit<PaymentIntentRow, "metadata_json"> & {
  metadata: Record<string, unknown>;
};

function parseMetadata(value: string): Record<string, unknown> {
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
  const { metadata_json: metadataJson, ...rest } = row;
  return {
    ...rest,
    expected_amount_mwk: Number(rest.expected_amount_mwk),
    paid_amount_mwk: rest.paid_amount_mwk == null ? null : Number(rest.paid_amount_mwk),
    metadata: parseMetadata(metadataJson),
  };
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
  const row = await env.PAYMENTS_DB.prepare(
    `select
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
       currency,
       status,
       customer_email,
       customer_phone,
       title,
       description,
       metadata_json,
       created_at,
       updated_at
     from payment_intents
     where app_id = ?1 and app_payment_id = ?2
     limit 1`,
  )
    .bind(appId, appPaymentId)
    .first<PaymentIntentRow>();

  return row ? mapPaymentIntent(row) : null;
}

function assertIdempotentMatch(existing: PaymentIntentRecord, input: CreatePaymentIntentInput): void {
  if (
    Number(existing.expected_amount_mwk) !== input.amountMwk ||
    existing.method !== input.method ||
    existing.purpose !== input.purpose
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

  const result = await env.PAYMENTS_DB.prepare(
    `insert or ignore into payment_intents (
       id,
       app_id,
       app_payment_id,
       app_user_id,
       purpose,
       provider,
       method,
       merchant_reference,
       expected_amount_mwk,
       currency,
       status,
       customer_email,
       customer_phone,
       title,
       description,
       metadata_json,
       created_at,
       updated_at
     ) values (
       ?1, ?2, ?3, ?4, ?5, 'paychangu', ?6, ?7, ?8, 'MWK', 'created',
       ?9, ?10, ?11, ?12, ?13, ?14, ?14
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
      input.amountMwk,
      input.customerEmail,
      input.customerPhone || null,
      input.title || null,
      input.description || null,
      JSON.stringify(input.metadata || {}),
      now,
    )
    .run();

  if (!result.success) {
    throw new Error("D1 could not create the payment intent.");
  }

  const intent = await findPaymentIntent(env, input.appId, input.appPaymentId);
  if (!intent) {
    throw new Error("D1 did not return the payment intent after creation.");
  }

  if ((result.meta?.changes || 0) === 0) {
    assertIdempotentMatch(intent, input);
    return { intent, created: false };
  }

  return { intent, created: true };
}
