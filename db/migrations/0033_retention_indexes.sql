-- BRC Map — indexes for the hourly retention sweep (server/utils/retention.ts),
-- which is the first thing that ever deletes rows by age. Idempotent.
create index if not exists messages_created_idx on messages(created_at);
create index if not exists password_reset_tokens_expires_idx on password_reset_tokens(expires_at);
create index if not exists moop_reports_cleaned_idx on moop_reports(cleaned_at) where status = 'cleaned';
create index if not exists ride_connections_status_idx on ride_connections(status);
create index if not exists audit_log_action_idx on audit_log(action);
