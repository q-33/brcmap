-- BurnerMap — retire the 'gpe' role. Idempotent.
-- The Gate Road conditions board it existed for is gone, so the role granted
-- nothing; anyone still carrying it is demoted to a plain 'user'.
-- Roles are now: 'user' | 'admin' | 'org' | 'tco' | 'hubs'.
update users set role = 'user' where role = 'gpe';
alter table users drop constraint if exists users_role_chk;
alter table users add constraint users_role_chk
  check (role in ('user', 'admin', 'org', 'tco', 'hubs'));
