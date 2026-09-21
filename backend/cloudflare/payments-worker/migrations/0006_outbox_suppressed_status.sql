PRAGMA foreign_keys = OFF;

DROP INDEX IF EXISTS payment_outbox_pending_idx;
DROP INDEX IF EXISTS payment_outbox_intent_idx;

CREATE TABLE payment_outbox_events_v3 (
  id TEXT PRIMARY KEY,
  payment_intent_id TEXT NOT NULL REFERENCES payment_intents(id),
  app_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  idempotency_key TEXT NOT NULL UNIQUE,
  payload_json TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (
    status IN ('pending', 'delivering', 'delivered', 'failed', 'suppressed')
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
ALTER TABLE payment_outbox_events_v3 RENAME TO payment_outbox_events;

CREATE INDEX payment_outbox_pending_idx
  ON payment_outbox_events (status, next_attempt_at)
  WHERE status IN ('pending', 'failed');
CREATE INDEX payment_outbox_intent_idx
  ON payment_outbox_events (payment_intent_id, created_at DESC);

PRAGMA foreign_keys = ON;
