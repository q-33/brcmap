-- Let admins post "official" events that aren't tied to a camp (camp_id NULL).
-- Idempotent / replay-safe: DROP NOT NULL is a no-op if the column is already
-- nullable. The FK + ON DELETE CASCADE stay; a NULL camp_id just has no camp.
ALTER TABLE events ALTER COLUMN camp_id DROP NOT NULL;
