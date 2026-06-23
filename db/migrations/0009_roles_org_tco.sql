-- BurnerMap — add two user roles. Idempotent.
--   'org' : Burning Man Organization officials — may post gate conditions and
--           place/edit/move ANY camp (placement powers, short of full admin).
--   'tco' : Theme Camp Organizers — may create & manage their own camp(s).
-- Roles are now: 'user' | 'gpe' | 'admin' | 'org' | 'tco' (stored as plain text
-- with a CHECK constraint, so adding a role is just swapping the constraint).
alter table users drop constraint if exists users_role_chk;
alter table users add constraint users_role_chk
  check (role in ('user', 'gpe', 'admin', 'org', 'tco'));
