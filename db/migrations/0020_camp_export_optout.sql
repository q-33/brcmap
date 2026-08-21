-- Let a camp opt out of third-party data exports.
--
-- The August broadcast told camps their listing would be shared with the
-- Meshtastic app and that they could reply to be excluded. Without somewhere to
-- record that, the promise is unenforceable — the export would quietly include
-- people who had asked to be left out. This is that column.
--
-- Default false: included, exactly as the mail said. Setting it true removes the
-- camp from /api/export/* while leaving it fully visible on brcmap.net itself.
ALTER TABLE camps ADD COLUMN IF NOT EXISTS exclude_from_export boolean NOT NULL DEFAULT false;
