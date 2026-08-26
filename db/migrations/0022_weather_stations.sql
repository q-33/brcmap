-- Local weather stations, managed by admins instead of by deploy.
--
-- Stations arrive mid-event: someone drives one out, someone else's comes online
-- a day later, one gets packed early. Editing a TypeScript array and waiting for
-- a build is the wrong shape for that, so they live here and the admin panel
-- adds them by the vendor's own station id.
--
-- `station_id` is text because vendors disagree: Weather Underground uses call
-- signs like KNVGERLA2, Tempest uses integers. `vendor` says which client reads it.
--
-- lat/lng are NULLABLE and filled in from the vendor's own reply — never typed by
-- hand. The position decides whether a station is trusted (see MAX_STATION_KM),
-- so it has to come from the station itself, not from whoever added it.
CREATE TABLE IF NOT EXISTS weather_stations (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor      text NOT NULL,
  station_id  text NOT NULL,
  label       text,
  owner       text,
  active      boolean NOT NULL DEFAULT true,
  -- optional window; null means "whenever it is reporting"
  active_from date,
  active_to   date,
  -- last known position and reading, refreshed on each successful poll
  lat         double precision,
  lng         double precision,
  last_seen_at timestamptz,
  note        text,
  added_by    uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (vendor, station_id)
);

CREATE INDEX IF NOT EXISTS weather_stations_active_idx ON weather_stations (active);
