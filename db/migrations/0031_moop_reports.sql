-- BurnerMap — anonymous MOOP pins for DPW Resto. Idempotent.
--
-- A pin says "matter out of place is HERE" so a line sweep can find it. Fully
-- anonymous both ways — resto crew don't make accounts from the line — using
-- the same daily-rotating visitor hash as the pulse: enough to rate-limit,
-- never enough to identify. Marking a pin cleaned is also anonymous and also
-- reversible; the worst vandalism can do is make a sweep re-check a spot,
-- and the worst an account wall would do is make nobody report at all.
create table if not exists moop_reports (
  id         uuid primary key default gen_random_uuid(),
  visitor    text not null,
  lat        double precision not null,
  lng        double precision not null,
  category   text not null,
  note       text,
  status     text not null default 'open',
  cleaned_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint moop_category_chk check (category in
    ('burn-scar', 'gray-water', 'debris', 'wood-metal', 'carpet-fabric', 'other')),
  constraint moop_status_chk check (status in ('open', 'cleaned'))
);
create index if not exists moop_reports_status_idx on moop_reports(status, created_at desc);
create index if not exists moop_reports_visitor_idx on moop_reports(visitor, created_at desc);
drop trigger if exists moop_reports_set_updated on moop_reports;
create trigger moop_reports_set_updated
  before update on moop_reports for each row execute function set_updated_at();
