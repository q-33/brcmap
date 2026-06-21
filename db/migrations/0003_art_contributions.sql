-- BurnerMap — art "open calls" + community contributions. Idempotent.
-- An artwork may carry a `call` (a prompt asking the community to contribute,
-- e.g. hand-translated phrases). Burners submit text contributions that the
-- artwork's owner approves before they appear publicly.

-- The artist's ask, shown on the artwork's detail page. Null = no open call.
alter table art add column if not exists "call" text;

-- Contributions belong to one artwork and one (logged-in) contributor.
-- status: 'pending' (default, awaiting owner approval) | 'published' | 'hidden'.
create table if not exists art_contributions (
  id              uuid primary key default gen_random_uuid(),
  art_id          uuid not null references art(id)   on delete cascade,
  contributor_id  uuid          references users(id) on delete set null,
  author_name     text,                 -- snapshot of the contributor's display name
  body            text not null,        -- the contribution itself (e.g. a translation)
  language        text,                 -- optional language / dialect note
  media_url       text,                 -- optional link (e.g. to a hosted photo)
  status          text not null default 'pending',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint art_contributions_status_chk
    check (status in ('pending', 'published', 'hidden'))
);
create index if not exists art_contributions_art_idx     on art_contributions(art_id);
create index if not exists art_contributions_status_idx  on art_contributions(art_id, status);
create index if not exists art_contributions_author_idx  on art_contributions(contributor_id);

drop trigger if exists art_contributions_set_updated on art_contributions;
create trigger art_contributions_set_updated
  before update on art_contributions for each row execute function set_updated_at();
