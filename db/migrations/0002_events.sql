-- BurnerMap — events. Camps announce planned events. Idempotent.
-- Times are stored as playa wall-clock (timestamp WITHOUT tz): everyone on the
-- playa shares one timezone, so "Wed 3:00 PM" stays "Wed 3:00 PM" for all viewers.

create table if not exists events (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid references users(id) on delete set null,
  camp_id     uuid not null references camps(id) on delete cascade,
  title       text not null,
  description text,
  starts_at   timestamp not null,   -- playa local time
  ends_at     timestamp,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists events_camp_idx   on events(camp_id);
create index if not exists events_starts_idx  on events(starts_at);
create index if not exists events_owner_idx   on events(owner_id);

drop trigger if exists events_set_updated on events;
create trigger events_set_updated before update on events for each row execute function set_updated_at();
