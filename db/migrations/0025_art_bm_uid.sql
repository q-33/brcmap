-- BurnerMap — remember which artwork is which in Burning Man's own directory.
-- Idempotent.
--
-- Their /api/art records carry a stable `uid` ("a2IVI000002Womv2AC"). Without
-- somewhere to keep it, every re-import has to match on the artwork's NAME, and
-- names drift: their "EIFFELA BROKEN DREAM" is our "Eifella Broken Dream", one
-- typo away from silently becoming a second pin for the same sculpture.
--
-- Nullable on purpose. Art created by a burner here has no BM uid and never
-- will; a null means "ours", and the unique index means their directory can
-- only ever map onto one of our rows.
alter table art add column if not exists bm_uid text;
create unique index if not exists art_bm_uid_idx on art(bm_uid) where bm_uid is not null;
