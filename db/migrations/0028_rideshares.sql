-- BurnerMap — rideshares: burners offering seats or looking for one. Idempotent.
--
-- A post is an OFFER ("driving to Reno Sunday, 2 seats") or a REQUEST ("need a
-- ride to SF, one duffel"). The connection itself happens in the in-app
-- messaging system — this table is only the board. `from_location` is where the
-- poster is right now (their camp address), because "meet me at 7:30 & E" is
-- how a ride actually starts on playa.
--
-- status: 'open' | 'closed' (found a match / car is full). Closed posts stay
-- for the poster but leave the public board.
create table if not exists rides (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null references users(id) on delete cascade,
  kind          text not null,
  destination   text not null,
  departs       text,
  seats         integer,
  luggage       text,
  from_location text,
  note          text,
  status        text not null default 'open',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint rides_kind_chk check (kind in ('offer', 'request')),
  constraint rides_status_chk check (status in ('open', 'closed'))
);
create index if not exists rides_status_idx on rides(status, created_at desc);
create index if not exists rides_owner_idx on rides(owner_id);
drop trigger if exists rides_set_updated on rides;
create trigger rides_set_updated
  before update on rides for each row execute function set_updated_at();
