PRAGMA foreign_keys = OFF;

DROP INDEX IF EXISTS payment_intents_app_status_idx;
DROP INDEX IF EXISTS payment_intents_provider_reference_idx;
DROP INDEX IF EXISTS payment_webhook_events_intent_idx;
DROP INDEX IF EXISTS payment_outbox_pending_idx;
DROP INDEX IF EXISTS payment_outbox_intent_idx;

CREATE TABLE payment_intents_v3 (
  id TEXT PRIMARY KEY,
  app_id TEXT NOT NULL,
  app_payment_id TEXT NOT NULL,
  app_user_id TEXT,
  purpose TEXT NOT NULL,
  provider TEXT NOT NULL DEFAULT 'paychangu' CHECK (provider = 'paychangu'),
  method TEXT NOT NULL CHECK (method IN ('airtel_money', 'mpamba', 'bank_transfer', 'card', 'hosted_checkout')),
  merchant_reference TEXT NOT NULL UNIQUE,
  provider_reference TEXT UNIQUE,
  expected_amount_mwk INTEGER CHECK (expected_amount_mwk IS NULL OR expected_amount_mwk > 0),
  paid_amount_mwk INTEGER CHECK (paid_amount_mwk IS NULL OR paid_amount_mwk >= 0),
  expected_amount_minor INTEGER NOT NULL CHECK (expected_amount_minor > 0),
  paid_amount_minor INTEGER CHECK (paid_amount_minor IS NULL OR paid_amount_minor >= 0),
  currency TEXT NOT NULL DEFAULT 'MWK' CHECK (currency IN ('MWK', 'USD')),
  status TEXT NOT NULL DEFAULT 'created' CHECK (
    status IN ('created', 'pending', 'paid', 'failed', 'cancelled', 'expired')
  ),
  customer_email TEXT,
  customer_phone TEXT,
  title TEXT,
  description TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  provider_payload_json TEXT NOT NULL DEFAULT '{}',
  checkout_url TEXT,
  failure_reason TEXT,
  paid_at TEXT,
  verified_at TEXT,
  fulfilled_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (app_id, app_payment_id)
);

INSERT INTO payment_intents_v3 (
  id, app_id, app_payment_id, app_user_id, purpose, provider, method,
  merchant_reference, provider_reference, expected_amount_mwk, paid_amount_mwk,
  expected_amount_minor, paid_amount_minor, currency, status,
  customer_email, customer_phone, title, description, metadata_json,
  provider_payload_json, checkout_url, failure_reason, paid_at, verified_at,
  fulfilled_at, created_at, updated_at
)
SELECT
  id, app_id, app_payment_id, app_user_id, purpose, provider, method,
  merchant_reference, provider_reference, expected_amount_mwk, paid_amount_mwk,
  expected_amount_mwk, paid_amount_mwk, currency, status,
  customer_email, customer_phone, title, description, metadata_json,
  provider_payload_json, checkout_url, failure_reason, paid_at, verified_at,
  fulfilled_at, created_at, updated_at
FROM payment_intents;

CREATE TABLE payment_webhook_events_v3 (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL DEFAULT 'paychangu' CHECK (provider = 'paychangu'),
  event_key TEXT NOT NULL,
  payment_intent_id TEXT REFERENCES payment_intents_v3(id),
  signature_valid INTEGER NOT NULL DEFAULT 0 CHECK (signature_valid IN (0, 1)),
  status TEXT NOT NULL DEFAULT 'received' CHECK (
    status IN ('received', 'processing', 'processed', 'ignored', 'failed')
  ),
  payload_json TEXT NOT NULL DEFAULT '{}',
  error_message TEXT,
  received_at TEXT NOT NULL,
  processed_at TEXT,
  UNIQUE (provider, event_key)
);

INSERT INTO payment_webhook_events_v3 (
  id, provider, event_key, payment_intent_id, signature_valid, status,
  payload_json, error_message, received_at, processed_at
)
SELECT
  id, provider, event_key, payment_intent_id, signature_valid, status,
  payload_json, error_message, received_at, processed_at
FROM payment_webhook_events;

CREATE TABLE payment_outbox_events_v3 (
  id TEXT PRIMARY KEY,
  payment_intent_id TEXT NOT NULL REFERENCES payment_intents_v3(id),
  app_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  idempotency_key TEXT NOT NULL UNIQUE,
  payload_json TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (
    status IN ('pending', 'delivering', 'delivered', 'failed')
  ),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  next_attempt_at TEXT NOT NULL,
  last_error TEXT,
  delivered_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

INSERT INTO payment_outbox_events_v3 (
  id, payment_intent_id, app_id, event_type, idempotency_key, payload_json,
  status, attempts, next_attempt_at, last_error, delivered_at, created_at, updated_at
)
SELECT
  id, payment_intent_id, app_id, event_type, idempotency_key, payload_json,
  status, attempts, next_attempt_at, last_error, delivered_at, created_at, updated_at
FROM payment_outbox_events;

DROP TABLE payment_outbox_events;
DROP TABLE payment_webhook_events;
DROP TABLE payment_intents;

ALTER TABLE payment_intents_v3 RENAME TO payment_intents;
ALTER TABLE payment_webhook_events_v3 RENAME TO payment_webhook_events;
ALTER TABLE payment_outbox_events_v3 RENAME TO payment_outbox_events;

CREATE INDEX payment_intents_app_status_idx
  ON payment_intents (app_id, status, created_at DESC);
CREATE INDEX payment_intents_provider_reference_idx
  ON payment_intents (provider_reference)
  WHERE provider_reference IS NOT NULL;
CREATE INDEX payment_webhook_events_intent_idx
  ON payment_webhook_events (payment_intent_id, received_at DESC);
CREATE INDEX payment_outbox_pending_idx
  ON payment_outbox_events (status, next_attempt_at)
  WHERE status IN ('pending', 'failed');
CREATE INDEX payment_outbox_intent_idx
  ON payment_outbox_events (payment_intent_id, created_at DESC);

PRAGMA foreign_keys = ON;
