-- BurnerMap — per-user feature flags, content reports, and a moderation audit
-- log. All additive. Idempotent.

-- Early access: grant specific upcoming features to specific users.
create table if not exists user_features (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references users(id) on delete cascade,
  feature       text not null,
  granted_by_id uuid references users(id) on delete set null,
  created_at    timestamptz not null default now(),
  unique (user_id, feature)
);
create index if not exists user_features_user_idx on user_features(user_id);

-- User-submitted reports / flags on a camp or artwork.
create table if not exists content_reports (
  id             uuid primary key default gen_random_uuid(),
  content_type   text not null,                 -- 'camp' | 'art'
  content_id     uuid not null,
  reporter_id    uuid references users(id) on delete set null,
  reason         text,
  status         text not null default 'open',  -- open | resolved | dismissed
  resolved_by_id uuid references users(id) on delete set null,
  resolved_at    timestamptz,
  created_at     timestamptz not null default now(),
  constraint content_reports_type_chk check (content_type in ('camp', 'art')),
  constraint content_reports_status_chk check (status in ('open', 'resolved', 'dismissed'))
);
create index if not exists content_reports_status_idx on content_reports(status, created_at desc);

-- Moderation / admin audit log.
create table if not exists audit_log (
  id          uuid primary key default gen_random_uuid(),
  actor_id    uuid references users(id) on delete set null,
  action      text not null,
  target_type text,
  target_id   text,
  detail      text,
  created_at  timestamptz not null default now()
);
create index if not exists audit_log_created_idx on audit_log(created_at desc);
