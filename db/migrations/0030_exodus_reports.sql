-- BurnerMap — crowd-reported Gate Road travel times during Exodus. Idempotent.
--
-- The org's live traffic channels (GARS 95.1, @bmantraffic) have no public
-- feed, so the live layer is our own people in the line. One tap, one row:
-- how long the reporter believes Gate Road is taking right now.
--
-- `visitor` is the same daily-rotating anonymous hash the usage pulse uses —
-- no account needed (nobody makes one from a stopped car), but one visitor can
-- only speak once per half hour, which keeps a bored passenger from voting
-- twelve times. Reports age out of the display in hours; the table is tiny.
create table if not exists exodus_reports (
  id         uuid primary key default gen_random_uuid(),
  visitor    text not null,
  minutes    integer not null,
  created_at timestamptz not null default now(),
  constraint exodus_minutes_chk check (minutes >= 0 and minutes <= 720)
);
create index if not exists exodus_reports_created_idx on exodus_reports(created_at desc);
create index if not exists exodus_reports_visitor_idx on exodus_reports(visitor, created_at desc);
