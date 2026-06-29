-- Remove the content-reports / flagging feature. The Reports admin tab and the
-- "Report this artwork" button were removed; this drops the backing table.
-- Idempotent: safe to re-run. (Historical 'report.*' rows in audit_log are left
-- intact as a record of past moderation actions.)
DROP TABLE IF EXISTS content_reports;
