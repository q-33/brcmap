-- BurnerMap — durable broadcast queue. Idempotent.
--
-- The old broadcast sent every email inside one HTTP request: 440 sequential
-- SMTP sends took longer than any request is allowed to live, died mid-loop
-- with no record of where, and a retry double-mailed the early recipients.
-- DreamHost's ~100/hour relay cap finished off whatever survived.
--
-- Now a send is two tables: one broadcast, N recipient rows. The request only
-- ENQUEUES; a server-side drip worker delivers a few per minute, forever, and
-- every row remembers its own fate — so progress is visible, restarts are
-- harmless, and nobody is ever mailed twice.
create table if not exists broadcasts (
  id         uuid primary key default gen_random_uuid(),
  subject    text not null,
  body       text not null,
  created_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now()
);
create table if not exists broadcast_recipients (
  id           uuid primary key default gen_random_uuid(),
  broadcast_id uuid not null references broadcasts(id) on delete cascade,
  email        text not null,
  status       text not null default 'queued',
  attempts     integer not null default 0,
  last_error   text,
  sent_at      timestamptz,
  created_at   timestamptz not null default now(),
  constraint broadcast_recipient_status_chk check (status in ('queued', 'sent', 'failed')),
  constraint broadcast_recipient_uniq unique (broadcast_id, email)
);
create index if not exists broadcast_recipients_pending_idx
  on broadcast_recipients(status, attempts, created_at) where status = 'queued';
