-- BRC Map — admin-movable civic landmarks.
--
-- The 48 civic landmarks (medical, Rangers, ice, the gate complex, the Temple)
-- live as constants in lib/brc/cityGeoJson.ts. Most come from Burning Man's
-- surveyed GIS, but the ones with no official equivalent are estimates, and
-- burners keep writing in to correct them. Until now each correction cost a code
-- change and a deploy.
--
-- This table stores ONLY corrections, keyed by landmark name. The code stays the
-- default and the source of truth in git; an override wins when present, so
-- deleting a row reverts to the shipped position. Read defensively — if this
-- table is missing or slow, the map still draws every landmark.
CREATE TABLE IF NOT EXISTS landmark_overrides (
  name       text PRIMARY KEY,
  lat        double precision NOT NULL,
  lng        double precision NOT NULL,
  note       text,
  moved_by   uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
