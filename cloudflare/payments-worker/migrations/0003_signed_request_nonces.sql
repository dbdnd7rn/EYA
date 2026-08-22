create table if not exists request_nonces (
  app_id text not null,
  nonce text not null,
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  expires_at text not null,
  primary key (app_id, nonce)
);

create index if not exists idx_request_nonces_expires_at
  on request_nonces(expires_at);
