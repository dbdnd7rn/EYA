create table if not exists request_rate_limits (
  route text not null,
  subject_hash text not null,
  window_start integer not null,
  request_count integer not null default 1 check (request_count > 0),
  primary key (route, subject_hash, window_start)
);

create index if not exists idx_request_rate_limits_window_start
  on request_rate_limits(window_start);
