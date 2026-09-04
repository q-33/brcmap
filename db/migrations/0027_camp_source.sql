-- BurnerMap — tell apart camps that registered here from camps pulled out of
-- Burning Man's public placement directory. Idempotent.
--
-- This map began as camps who CHOSE to share where they are. Importing the
-- official directory makes it the whole city, which is more useful — but it
-- would quietly erase that distinction, and the distinction is the honest part.
-- 'community' is a camp that came here and asked to be on the map; 'official'
-- is one we copied from placement.
--
-- Existing rows are all community: every camp in the table before this was put
-- there by a person. The default keeps it that way for anything created through
-- the site from now on.
alter table camps add column if not exists source text not null default 'community';
alter table camps add column if not exists bm_uid text;
alter table camps drop constraint if exists camps_source_chk;
alter table camps add constraint camps_source_chk check (source in ('community', 'official'));
create unique index if not exists camps_bm_uid_idx on camps(bm_uid) where bm_uid is not null;
create index if not exists camps_source_idx on camps(source);
