-- BurnerMap — user roles + Gate Road traffic conditions. Idempotent.
-- GPE (Gate, Perimeter & Exodus) crew post live inbound/exodus conditions;
-- everyone else reads them. Authorization is by user role.

-- Roles: 'user' (default) | 'gpe' (can post gate conditions) | 'admin'.
alter table users add column if not exists role text not null default 'user';
do $$ begin
  alter table users add constraint users_role_chk check (role in ('user', 'gpe', 'admin'));
exception when duplicate_object then null; end $$;

-- Append-only log; the newest row per direction is the current condition.
create table if not exists gate_conditions (
  id            uuid primary key default gen_random_uuid(),
  direction     text not null,                -- 'inbound' | 'exodus'
  status        text not null,                -- open|light|moderate|heavy|hold|closed
  wait_label    text,                         -- e.g. "2–4 hours"
  note          text,
  updated_by_id uuid references users(id) on delete set null,
  created_at    timestamptz not null default now(),
  constraint gate_conditions_dir_chk check (direction in ('inbound', 'exodus')),
  constraint gate_conditions_status_chk check (status in ('open', 'light', 'moderate', 'heavy', 'hold', 'closed'))
);
create index if not exists gate_conditions_dir_idx on gate_conditions(direction, created_at desc);
