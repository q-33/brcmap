-- BRC Map — add optional per-camp structure height (feet) for the sun & shade
-- tool, so shadow length reflects the real structure instead of a fixed
-- reference height. Idempotent (the migration runner replays every file).
ALTER TABLE camps ADD COLUMN IF NOT EXISTS height_ft double precision;
