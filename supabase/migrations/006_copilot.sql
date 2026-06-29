-- ============================================================
-- CAK AI Ecosystem — MIGRATION 006: COPILOT MEMORY
-- Persist Copilot conversations per team member so chatrooms are
-- saved and the assistant has memory across sessions.
-- Run AFTER 005_account_connections.sql.
-- ============================================================

create table if not exists copilot_threads (
  id uuid primary key default uuid_generate_v4(),
  member_id uuid references team_members(id) on delete cascade,
  title text,
  route text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  last_message_at timestamptz default now()
);

create table if not exists copilot_messages (
  id uuid primary key default uuid_generate_v4(),
  thread_id uuid references copilot_threads(id) on delete cascade,
  member_id uuid references team_members(id) on delete set null,
  role text not null,                    -- user | assistant
  content text not null,
  created_at timestamptz default now()
);

create index if not exists idx_copilot_threads_member on copilot_threads(member_id, last_message_at desc);
create index if not exists idx_copilot_messages_thread on copilot_messages(thread_id, created_at);

drop trigger if exists trg_copilot_threads_updated on copilot_threads;
create trigger trg_copilot_threads_updated before update on copilot_threads
  for each row execute function set_updated_at();
