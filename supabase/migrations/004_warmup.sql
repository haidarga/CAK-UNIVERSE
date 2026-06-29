-- ============================================================
-- CAK AI Ecosystem — MIGRATION 004: WARMUP AUTOMATION
-- Real account warmup: connected accounts perform human-like
-- scroll / watch / like / comment / follow with jittered delays.
-- These tables log every session + action for audit & safety.
-- Run AFTER 003_integrations.sql.
-- ============================================================

-- Track when an account last ran a warmup session (used by the scheduler).
alter table accounts add column if not exists last_warmup_at timestamptz;
alter table accounts add column if not exists warmup_enabled boolean default true;

-- ----------------------------------------------------------------
-- WARMUP RUNS — one row per automation session
-- ----------------------------------------------------------------
create table if not exists warmup_runs (
  id uuid primary key default uuid_generate_v4(),
  account_id uuid references accounts(id) on delete cascade,
  phase text,
  status text default 'running',        -- running | completed | failed | skipped
  videos int default 0,
  likes int default 0,
  comments int default 0,
  follows int default 0,
  actions_planned int default 0,
  actions_done int default 0,
  note text,
  error text,
  started_at timestamptz default now(),
  finished_at timestamptz,
  created_at timestamptz default now()
);

-- ----------------------------------------------------------------
-- WARMUP ACTIONS — granular log of each action performed
-- ----------------------------------------------------------------
create table if not exists warmup_actions (
  id uuid primary key default uuid_generate_v4(),
  run_id uuid references warmup_runs(id) on delete cascade,
  account_id uuid references accounts(id) on delete cascade,
  type text not null,                   -- scroll | watch | like | comment | follow
  target_url text,
  comment_text text,                    -- AI-generated, non-template
  watch_ms int,
  delay_ms int,
  status text default 'done',           -- done | failed | skipped
  created_at timestamptz default now()
);

create index if not exists idx_warmup_runs_account on warmup_runs(account_id, created_at desc);
create index if not exists idx_warmup_actions_run on warmup_actions(run_id);
create index if not exists idx_accounts_last_warmup on accounts(last_warmup_at);
