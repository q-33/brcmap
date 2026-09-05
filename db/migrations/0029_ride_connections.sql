-- BurnerMap — ride connections: two burners agreeing to share live location
-- with each other until one of them stops. Idempotent.
--
-- The consent model IS the schema:
--   'pending'  the requester asked; nobody is sharing anything yet
--   'active'   the post's owner accepted; BOTH sides may now share
--   'ended'    either side stopped; positions are nulled at that moment,
--              because a dead connection must not keep anyone's last fix
--
-- Positions live on the row (one pair per connection) rather than in a history
-- table on purpose: this system remembers where two people ARE, never where
-- they have been. There is deliberately nothing to subpoena but the present.
create table if not exists ride_connections (
  id            uuid primary key default gen_random_uuid(),
  ride_id       uuid not null references rides(id) on delete cascade,
  requester_id  uuid not null references users(id) on delete cascade,
  status        text not null default 'pending',
  owner_lat     double precision,
  owner_lng     double precision,
  owner_at      timestamptz,
  requester_lat double precision,
  requester_lng double precision,
  requester_at  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint ride_connections_status_chk check (status in ('pending', 'active', 'ended')),
  constraint ride_connections_uniq unique (ride_id, requester_id)
);
create index if not exists ride_connections_ride_idx on ride_connections(ride_id);
create index if not exists ride_connections_requester_idx on ride_connections(requester_id);
drop trigger if exists ride_connections_set_updated on ride_connections;
create trigger ride_connections_set_updated
  before update on ride_connections for each row execute function set_updated_at();
