import type {
  D1PreparedStatementLike,
  D1RunResult,
  PaymentIntentRecord,
  PaymentsEnv,
} from "./ledger";

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
  paid_at: string | null;
  verified_at: string | null;
  fulfilled_at: string | null;
  created_at: string;
  updated_at: string;
};

export type PaymentWebhookEventRecord = {
  id: string;
  event_key: string;
  payment_intent_id: string | null;
  status: "received" | "processing" | "processed" | "ignored" | "failed";
  received_at: string;
  processed_at: string | null;
};

type D1DatabaseWithBatch = PaymentsEnv["PAYMENTS_DB"] & {
  batch(statements: D1PreparedStatementLike[]): Promise<D1RunResult[]>;
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
  const {
    metadata_json: metadataJson,
    provider_payload_json: providerPayloadJson,
    ...rest
  } = row;

  return {
    ...rest,
    expected_amount_mwk: Number(rest.expected_amount_mwk),
    paid_amount_mwk: rest.paid_amount_mwk == null ? null : Number(rest.paid_amount_mwk),
    metadata: parseJsonObject(metadataJson),
    provider_payload: parseJsonObject(providerPayloadJson),
  } as PaymentIntentRecord;
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
   paid_at,
   verified_at,
   fulfilled_at,
   created_at,
   updated_at
 from payment_intents`;

export async function findPaymentIntentByMerchantReference(
  env: PaymentsEnv,
  merchantReference: string,
): Promise<PaymentIntentRecord | null> {
  const row = await env.PAYMENTS_DB.prepare(
    `${PAYMENT_INTENT_SELECT}
     where merchant_reference = ?1
     limit 1`,
  )
    .bind(merchantReference)
    .first<PaymentIntentRow>();

  return row ? mapPaymentIntent(row) : null;
}

async function findPaymentIntentById(
  env: PaymentsEnv,
  id: string,
): Promise<PaymentIntentRecord | null> {
  const row = await env.PAYMENTS_DB.prepare(
    `${PAYMENT_INTENT_SELECT}
     where id = ?1
     limit 1`,
  )
    .bind(id)
    .first<PaymentIntentRow>();

  return row ? mapPaymentIntent(row) : null;
}

export async function createOrLoadWebhookEvent(
  env: PaymentsEnv,
  eventKey: string,
  payload: Record<string, unknown>,
): Promise<{ event: PaymentWebhookEventRecord; created: boolean }> {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const result = await env.PAYMENTS_DB.prepare(
    `insert or ignore into payment_webhook_events (
       id,
       provider,
       event_key,
       signature_valid,
       status,
       payload_json,
       received_at
     ) values (?1, 'paychangu', ?2, 1, 'received', ?3, ?4)`,
  )
    .bind(id, eventKey, JSON.stringify(payload), now)
    .run();

  if (!result.success) throw new Error("D1 could not store the PayChangu webhook event.");

  const event = await env.PAYMENTS_DB.prepare(
    `select id, event_key, payment_intent_id, status, received_at, processed_at
     from payment_webhook_events
     where provider = 'paychangu' and event_key = ?1
     limit 1`,
  )
    .bind(eventKey)
    .first<PaymentWebhookEventRecord>();

  if (!event) throw new Error("D1 did not return the PayChangu webhook event.");
  return { event, created: (result.meta?.changes || 0) > 0 };
}

export async function updateWebhookEvent(
  env: PaymentsEnv,
  eventId: string,
  status: PaymentWebhookEventRecord["status"],
  paymentIntentId: string | null,
  errorMessage: string | null,
): Promise<void> {
  const processedAt = status === "processed" || status === "ignored" ? new Date().toISOString() : null;
  const result = await env.PAYMENTS_DB.prepare(
    `update payment_webhook_events
     set status = ?2,
         payment_intent_id = coalesce(?3, payment_intent_id),
         error_message = ?4,
         processed_at = ?5
     where id = ?1`,
  )
    .bind(eventId, status, paymentIntentId, errorMessage?.slice(0, 1000) || null, processedAt)
    .run();

  if (!result.success) throw new Error("D1 could not update the PayChangu webhook event.");
}

export async function recordVerifiedPaymentState(
  env: PaymentsEnv,
  intent: PaymentIntentRecord,
  verification: {
    status: "success" | "pending" | "failed" | "cancelled" | "expired";
    paidAmountMwk: number;
    providerReference: string | null;
    providerPayload: Record<string, unknown>;
  },
): Promise<PaymentIntentRecord> {
  const now = new Date().toISOString();

  if (verification.status === "success") {
    if (intent.status === "paid") {
      if (intent.paid_amount_mwk !== verification.paidAmountMwk) {
        throw new Error("The verified payment amount conflicts with the stored paid amount.");
      }
      return intent;
    }

    const eventPayload = {
      event: "payment.paid",
      payment_intent_id: intent.id,
      app_id: intent.app_id,
      app_payment_id: intent.app_payment_id,
      app_user_id: intent.app_user_id,
      purpose: intent.purpose,
      merchant_reference: intent.merchant_reference,
      amount_mwk: verification.paidAmountMwk,
      currency: intent.currency,
      verified_at: now,
      metadata: intent.metadata,
    };

    const db = env.PAYMENTS_DB as D1DatabaseWithBatch;
    const statements = [
      db.prepare(
        `update payment_intents
         set status = 'paid',
             paid_amount_mwk = ?2,
             provider_reference = coalesce(?3, provider_reference),
             provider_payload_json = ?4,
             failure_reason = null,
             paid_at = coalesce(paid_at, ?5),
             verified_at = ?5,
             updated_at = ?5
         where id = ?1
           and merchant_reference = ?6
           and expected_amount_mwk = ?2
           and currency = 'MWK'
           and status in ('created', 'pending', 'failed', 'cancelled', 'expired')`,
      ).bind(
        intent.id,
        verification.paidAmountMwk,
        verification.providerReference,
        JSON.stringify(verification.providerPayload),
        now,
        intent.merchant_reference,
      ),
      db.prepare(
        `insert or ignore into payment_outbox_events (
           id,
           payment_intent_id,
           app_id,
           event_type,
           idempotency_key,
           payload_json,
           status,
           attempts,
           next_attempt_at,
           created_at,
           updated_at
         )
         select ?1, id, app_id, 'payment.paid', ?2, ?3, 'pending', 0, ?4, ?4, ?4
         from payment_intents
         where id = ?5 and status = 'paid'`,
      ).bind(
        crypto.randomUUID(),
        `payment.paid:${intent.id}`,
        JSON.stringify(eventPayload),
        now,
        intent.id,
      ),
    ];

    const results = await db.batch(statements);
    if (results.some((result) => !result.success)) {
      throw new Error("D1 could not atomically confirm the verified payment.");
    }
  } else {
    const terminal = ["failed", "cancelled", "expired"].includes(verification.status);
    const nextStatus = terminal ? verification.status : "pending";
    const reason = terminal ? `PayChangu verification returned ${verification.status}.` : null;

    const result = await env.PAYMENTS_DB.prepare(
      `update payment_intents
       set status = ?2,
           paid_amount_mwk = null,
           provider_reference = coalesce(?3, provider_reference),
           provider_payload_json = ?4,
           failure_reason = ?5,
           verified_at = ?6,
           updated_at = ?6
       where id = ?1
         and status <> 'paid'`,
    )
      .bind(
        intent.id,
        nextStatus,
        verification.providerReference,
        JSON.stringify(verification.providerPayload),
        reason,
        now,
      )
      .run();

    if (!result.success) throw new Error("D1 could not store the verified payment state.");
  }

  const stored = await findPaymentIntentById(env, intent.id);
  if (!stored) throw new Error("D1 did not return the payment intent after verification.");

  if (verification.status === "success" && stored.status !== "paid") {
    throw new Error("The payment intent did not transition to paid.");
  }

  return stored;
}
