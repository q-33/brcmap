-- BurnerMap — soft moderation: hide a camp or artwork without deleting it.
-- Hidden items disappear from public lists + the map but remain in the DB.
alter table camps add column if not exists hidden boolean not null default false;
alter table art add column if not exists hidden boolean not null default false;
