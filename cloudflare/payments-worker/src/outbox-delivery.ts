import type { PaymentsEnv } from "./ledger";
import { signApplicationEvent } from "./security";

const DELIVERY_TIMEOUT_MS = 15_000;
const DELIVERY_LEASE_MS = 5 * 60 * 1000;
const MAX_BATCH_SIZE = 10;

export type OutboxDeliverySummary = {
  attempted: number;
  delivered: number;
  failed: number;
  skipped: number;
};

type D1AllResult<T> = {
  success: boolean;
  results?: T[];
};

type OutboxRow = {
  id: string;
  payment_intent_id: string;
  app_id: string;
  event_type: string;
  idempotency_key: string;
  payload_json: string;
  status: "pending" | "delivering" | "delivered" | "failed" | "suppressed";
  attempts: number;
  next_attempt_at: string;
  last_error: string | null;
  created_at: string;
  updated_at: string;
};

type CallbackResponse = {
  status?: unknown;
  duplicate?: unknown;
  fulfilled?: unknown;
};

function parseJsonObject(value: string, field: string): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value || "{}");
  } catch {
    throw new Error(`${field} is not valid JSON.`);
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`${field} must be a JSON object.`);
  }

  return parsed as Record<string, unknown>;
}

function applicationSecretsJson(env: PaymentsEnv): string {
  const parsed = parseJsonObject(env.APP_SECRETS_JSON || "{}", "APP_SECRETS_JSON");
  const tourismSecret = env.ONLINE_TOURISM_APP_SECRET?.trim();
  if (tourismSecret) parsed["online-tourism"] = tourismSecret;
  return JSON.stringify(parsed);
}

function readAppCallbacks(raw: string | undefined, tourismCallbackUrl?: string): Record<string, string> {
  const parsed = parseJsonObject(raw || "{}", "APP_CALLBACKS_JSON");
  const callbacks: Record<string, string> = {};

  for (const [appId, value] of Object.entries(parsed)) {
    if (typeof value !== "string" || !value.trim()) continue;

    const callbackUrl = new URL(value.trim());
    if (callbackUrl.protocol !== "https:") {
      throw new Error(`Callback URL for ${appId} must use HTTPS.`);
    }

    callbacks[appId] = callbackUrl.toString();
  }

  if (tourismCallbackUrl?.trim()) {
    const callbackUrl = new URL(tourismCallbackUrl.trim());
    if (callbackUrl.protocol !== "https:") {
      throw new Error("Online Tourism callback URL must use HTTPS.");
    }
    callbacks["online-tourism"] = callbackUrl.toString();
  }

  return callbacks;
}

function nextAttemptAt(attempts: number): string {
  const exponent = Math.max(0, Math.min(attempts - 1, 6));
  const delaySeconds = Math.min(60 * 2 ** exponent, 60 * 60);
  return new Date(Date.now() + delaySeconds * 1000).toISOString();
}

async function recoverExpiredDeliveryLeases(env: PaymentsEnv): Promise<void> {
  const now = new Date().toISOString();
  const leaseExpiredBefore = new Date(Date.now() - DELIVERY_LEASE_MS).toISOString();

  const result = await env.PAYMENTS_DB.prepare(
    `update payment_outbox_events
     set status = 'failed',
         last_error = 'Delivery lease expired before completion.',
         next_attempt_at = ?1,
         updated_at = ?1
     where status = 'delivering'
       and updated_at <= ?2`,
  )
    .bind(now, leaseExpiredBefore)
    .run();

  if (!result.success) throw new Error("D1 could not recover expired outbox delivery leases.");
}

async function listDueOutboxEvents(env: PaymentsEnv, limit: number): Promise<OutboxRow[]> {
  const statement = env.PAYMENTS_DB.prepare(
    `select
       id,
       payment_intent_id,
       app_id,
       event_type,
       idempotency_key,
       payload_json,
       status,
       attempts,
       next_attempt_at,
       last_error,
       created_at,
       updated_at
     from payment_outbox_events
     where status in ('pending', 'failed')
       and next_attempt_at <= ?1
     order by next_attempt_at asc, created_at asc
     limit ?2`,
  ).bind(new Date().toISOString(), limit) as unknown as {
    all<T>(): Promise<D1AllResult<T>>;
  };

  const result = await statement.all<OutboxRow>();
  if (!result.success) throw new Error("D1 could not list due outbox events.");
  return result.results || [];
}

async function claimOutboxEvent(env: PaymentsEnv, row: OutboxRow): Promise<OutboxRow | null> {
  const now = new Date().toISOString();
  const result = await env.PAYMENTS_DB.prepare(
    `update payment_outbox_events
     set status = 'delivering',
         attempts = attempts + 1,
         last_error = null,
         updated_at = ?2
     where id = ?1
       and status in ('pending', 'failed')
       and next_attempt_at <= ?2`,
  )
    .bind(row.id, now)
    .run();

  if (!result.success) throw new Error("D1 could not claim the outbox event for delivery.");
  if ((result.meta?.changes || 0) === 0) return null;

  return {
    ...row,
    status: "delivering",
    attempts: Number(row.attempts) + 1,
    last_error: null,
    updated_at: now,
  };
}

async function markDelivered(
  env: PaymentsEnv,
  row: OutboxRow,
  fulfilled: boolean,
): Promise<void> {
  const now = new Date().toISOString();
  const result = await env.PAYMENTS_DB.prepare(
    `update payment_outbox_events
     set status = 'delivered',
         delivered_at = ?2,
         last_error = null,
         updated_at = ?2
     where id = ?1
       and status = 'delivering'`,
  )
    .bind(row.id, now)
    .run();

  if (!result.success || (result.meta?.changes || 0) !== 1) {
    throw new Error("D1 could not mark the outbox event as delivered.");
  }

  if (fulfilled) {
    const fulfilmentResult = await env.PAYMENTS_DB.prepare(
      `update payment_intents
       set fulfilled_at = coalesce(fulfilled_at, ?2),
           updated_at = ?2
       where id = ?1
         and status = 'paid'`,
    )
      .bind(row.payment_intent_id, now)
      .run();

    if (!fulfilmentResult.success) {
      throw new Error("D1 could not store the application fulfilment timestamp.");
    }
  }
}

async function markFailed(env: PaymentsEnv, row: OutboxRow, error: unknown): Promise<void> {
  const message = error instanceof Error ? error.message : "Application callback delivery failed.";
  const now = new Date().toISOString();
  const result = await env.PAYMENTS_DB.prepare(
    `update payment_outbox_events
     set status = 'failed',
         last_error = ?2,
         next_attempt_at = ?3,
         updated_at = ?4
     where id = ?1
       and status = 'delivering'`,
  )
    .bind(row.id, message.slice(0, 1000), nextAttemptAt(row.attempts), now)
    .run();

  if (!result.success) throw new Error("D1 could not record the outbox delivery failure.");
}

async function deliverOutboxEvent(
  env: PaymentsEnv,
  row: OutboxRow,
  callbacks: Record<string, string>,
): Promise<{ delivered: true; fulfilled: boolean }> {
  const configuredCallback = callbacks[row.app_id];
  if (!configuredCallback) {
    throw new Error(`No application callback URL is configured for ${row.app_id}.`);
  }

  const callbackUrl = new URL(configuredCallback);
  const rawBody = row.payload_json;
  parseJsonObject(rawBody, "Outbox payload");

  const timestamp = Math.floor(Date.now() / 1000);
  const nonce = crypto.randomUUID().toLowerCase();
  const signature = await signApplicationEvent(
    row.app_id,
    timestamp,
    nonce,
    callbackUrl.pathname,
    rawBody,
    applicationSecretsJson(env),
  );

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DELIVERY_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(callbackUrl, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "x-vac-app-id": row.app_id,
        "x-vac-timestamp": String(timestamp),
        "x-vac-nonce": nonce,
        "x-vac-signature": signature,
        "x-vac-idempotency-key": row.idempotency_key,
      },
      body: rawBody,
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error("Application callback timed out.");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }

  const responseText = await response.text();
  let responsePayload: CallbackResponse = {};
  if (responseText.trim()) {
    try {
      responsePayload = JSON.parse(responseText) as CallbackResponse;
    } catch {
      throw new Error(`Application callback returned invalid JSON with HTTP ${response.status}.`);
    }
  }

  if (!response.ok) {
    throw new Error(`Application callback returned HTTP ${response.status}.`);
  }

  if (responsePayload.status !== "accepted") {
    throw new Error("Application callback did not acknowledge the payment event.");
  }

  return { delivered: true, fulfilled: responsePayload.fulfilled === true };
}

export async function deliverDueOutboxEvents(
  env: PaymentsEnv,
  requestedLimit = MAX_BATCH_SIZE,
): Promise<OutboxDeliverySummary> {
  if (!env.APP_SECRETS_JSON?.trim() && !env.ONLINE_TOURISM_APP_SECRET?.trim()) {
    throw new Error("Application payment secrets are not configured.");
  }

  const callbacks = readAppCallbacks(env.APP_CALLBACKS_JSON, env.ONLINE_TOURISM_CALLBACK_URL);
  const limit = Math.max(1, Math.min(Math.trunc(requestedLimit), MAX_BATCH_SIZE));
  const summary: OutboxDeliverySummary = { attempted: 0, delivered: 0, failed: 0, skipped: 0 };

  await recoverExpiredDeliveryLeases(env);
  const dueEvents = await listDueOutboxEvents(env, limit);

  for (const dueEvent of dueEvents) {
    const claimed = await claimOutboxEvent(env, dueEvent);
    if (!claimed) {
      summary.skipped += 1;
      continue;
    }

    summary.attempted += 1;

    try {
      const delivery = await deliverOutboxEvent(env, claimed, callbacks);
      await markDelivered(env, claimed, delivery.fulfilled);
      summary.delivered += 1;
    } catch (error) {
      console.error("[vac-payments] application callback delivery failed", {
        outboxEventId: claimed.id,
        appId: claimed.app_id,
        attempts: claimed.attempts,
        message: error instanceof Error ? error.message : "Unknown delivery error.",
      });
      await markFailed(env, claimed, error);
      summary.failed += 1;
    }
  }

  return summary;
}
