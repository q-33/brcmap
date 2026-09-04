-- BurnerMap — anonymous usage pulse, so "is anyone using the map" has an answer.
-- Idempotent.
--
-- `visitor` is sha256(server secret + playa date + IP + user agent), truncated.
-- It is NOT an identity: no IP is stored, nothing is reversible, and because the
-- playa date is inside the hash the value changes at playa midnight — the same
-- person tomorrow is a different visitor and cannot be followed across days.
--
-- One row per (visitor, path, minute). The unique index is what keeps a tab left
-- open all afternoon from writing a row per heartbeat, and it makes that the
-- database's guarantee rather than something the client is trusted to do.
create table if not exists usage_pulse (
  id         uuid primary key default gen_random_uuid(),
  visitor    text not null,
  path       text not null,
  bucket     timestamptz not null,
  created_at timestamptz not null default now()
);
create unique index if not exists usage_pulse_uniq on usage_pulse(visitor, path, bucket);
create index if not exists usage_pulse_bucket_idx on usage_pulse(bucket desc);
