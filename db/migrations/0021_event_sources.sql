-- Where an event came from.
--
-- Until now every event was posted by a camp or a burner on the site. We are
-- importing published guides too — QueerBurners is 300 events on its own — and
-- dropping those into one list would bury the handful a camp wrote itself.
--
-- 'user' is everything that already exists and everything posted through the
-- site from here. Imported guides carry their own key (see lib/eventSources.ts)
-- and the Events page lets a reader switch each one on or off.
ALTER TABLE events ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'user';
CREATE INDEX IF NOT EXISTS events_source_idx ON events (source);

-- Imported events have no owner and no camp row of their own, so keep the venue
-- the guide printed. "Patsy's Hangout (7:30 & D)" is how people will find it.
ALTER TABLE events ADD COLUMN IF NOT EXISTS venue text;
ALTER TABLE events ADD COLUMN IF NOT EXISTS venue_address text;
