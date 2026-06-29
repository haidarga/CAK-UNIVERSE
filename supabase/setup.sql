-- ============================================================
-- CAK AI Ecosystem — COMBINED SETUP (migrations 001 → 007)
-- Paste this whole file into the Supabase SQL Editor and Run.
-- Idempotent: safe to re-run.
-- ============================================================


-- >>> FILE: migrations/001_initial_schema.sql >>>
-- ============================================================
-- CAK AI Ecosystem — MIGRATION 001: INITIAL SCHEMA
-- Central Intelligence Hub (CIH) — single source of truth.
-- Run in Supabase SQL editor.
-- ============================================================

create extension if not exists "uuid-ossp";

-- ----------------------------------------------------------------
-- BRANDS
-- ----------------------------------------------------------------
create table if not exists brands (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  slug text unique not null,
  platform text not null default 'tiktok',

  campaign_tagline text,
  emotional_pillars jsonb default '[]',
  content_formats jsonb default '[]',
  posting_sweet_spot jsonb,

  guidelines text,
  guardrails jsonb default '[]',
  approved_claims jsonb default '[]',

  script_format text,
  cta_rules text,
  hashtag_sets jsonb default '[]',

  products jsonb default '[]',
  hero_products jsonb default '[]',

  kpi_targets jsonb,

  status text default 'active',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ----------------------------------------------------------------
-- PERSONAS
-- ----------------------------------------------------------------
create table if not exists personas (
  id uuid primary key default uuid_generate_v4(),
  brand_id uuid references brands(id) on delete cascade,
  name text not null,
  platform_username text,

  archetype text,
  tone_of_voice text,
  background text,
  language text default 'id',
  content_style jsonb,

  pain_points jsonb default '[]',
  emotional_clusters jsonb default '[]',

  created_at timestamptz default now()
);

-- ----------------------------------------------------------------
-- ACCOUNTS  (warmup tracking is the core feature)
-- ----------------------------------------------------------------
create table if not exists accounts (
  id uuid primary key default uuid_generate_v4(),
  brand_id uuid references brands(id) on delete cascade,
  persona_id uuid references personas(id),

  platform text not null,
  username text not null,
  account_url text,

  warmup_phase text default 'cold',
  warmup_started_at timestamptz,
  phase_changed_at timestamptz,
  warmup_notes text,

  daily_post_limit int default 1,
  min_hours_between_posts int default 24,

  follower_count int default 0,
  following_count int default 0,
  engagement_rate float default 0,
  avg_views_last_7d int default 0,
  total_posts int default 0,
  last_post_engagement float default 0,

  status text default 'active',
  last_posted_at timestamptz,
  last_scraped_at timestamptz,

  anomaly_flags jsonb default '[]',
  anomaly_flagged_at timestamptz,

  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ----------------------------------------------------------------
-- CONTENT PIPELINE  (brief -> posted state machine)
-- ----------------------------------------------------------------
create table if not exists content_pipeline (
  id uuid primary key default uuid_generate_v4(),
  brand_id uuid references brands(id) on delete cascade,
  account_id uuid references accounts(id),
  persona_id uuid references personas(id),

  stage text default 'briefed',
  stage_history jsonb default '[]',

  content_type text,
  emotional_pillar text,
  content_format text,

  content_direction jsonb,

  script jsonb,
  script_version int default 1,
  script_approved_at timestamptz,
  script_approved_by text,

  production_params jsonb,
  production_url text,
  production_batch_id text,

  qc_report jsonb,
  qc_reviewed_at timestamptz,
  qc_reviewed_by text,

  scheduled_at timestamptz,
  posted_at timestamptz,

  performance jsonb,
  performance_score float,

  batch_number int,
  week_number int,
  priority int default 5,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ----------------------------------------------------------------
-- HOOKS  (hook bank per brand per pillar)
-- ----------------------------------------------------------------
create table if not exists hooks (
  id uuid primary key default uuid_generate_v4(),
  brand_id uuid references brands(id) on delete cascade,

  hook_text text not null,
  emotional_pillar text not null,
  hook_type text,
  language text default 'id',

  performance_score float default 0,
  usage_count int default 0,
  last_used_at timestamptz,

  sourced_from text,
  sourced_post_id uuid references content_pipeline(id),

  created_at timestamptz default now()
);

-- ----------------------------------------------------------------
-- KPI METRICS  (daily snapshot per account)
-- ----------------------------------------------------------------
create table if not exists kpi_metrics (
  id uuid primary key default uuid_generate_v4(),
  brand_id uuid references brands(id) on delete cascade,
  account_id uuid references accounts(id) on delete cascade,
  date date not null,

  followers_start int default 0,
  followers_end int default 0,
  followers_gained int generated always as (followers_end - followers_start) stored,

  total_views int default 0,
  total_likes int default 0,
  total_comments int default 0,
  total_shares int default 0,
  total_saves int default 0,
  posts_published int default 0,

  engagement_rate float,
  avg_views_per_post float,

  warmup_phase text,
  recorded_at timestamptz default now(),

  unique (account_id, date)
);

-- ----------------------------------------------------------------
-- TRENDS  (viral content DB, daily refresh)
-- ----------------------------------------------------------------
create table if not exists trends (
  id uuid primary key default uuid_generate_v4(),
  brand_id uuid references brands(id),

  platform text not null,
  content_url text,
  thumbnail_url text,

  views int default 0,
  likes int default 0,
  shares int default 0,
  engagement_rate float default 0,

  content_category text,
  emotional_angle text,
  hook_pattern text,
  format_type text,
  replication_difficulty text,
  relevance_score float default 0,

  status text default 'new',
  used_in_pipeline uuid references content_pipeline(id),

  fetched_at timestamptz default now()
);

-- ----------------------------------------------------------------
-- AGENT LOGS  (observability for every agent run)
-- ----------------------------------------------------------------
create table if not exists agent_logs (
  id uuid primary key default uuid_generate_v4(),
  agent_name text not null,
  run_type text,

  brand_id uuid references brands(id),
  account_id uuid references accounts(id),
  pipeline_id uuid references content_pipeline(id),

  input_summary text,
  output_summary text,
  tokens_used int,
  duration_ms int,

  status text default 'success',
  error_message text,

  created_at timestamptz default now()
);

-- ----------------------------------------------------------------
-- INDEXES
-- ----------------------------------------------------------------
create index if not exists idx_accounts_brand_phase on accounts(brand_id, warmup_phase);
create index if not exists idx_accounts_brand_status on accounts(brand_id, status);
create index if not exists idx_pipeline_brand_stage on content_pipeline(brand_id, stage);
create index if not exists idx_pipeline_account on content_pipeline(account_id);
create index if not exists idx_kpi_account_date on kpi_metrics(account_id, date desc);
create index if not exists idx_trends_brand_status on trends(brand_id, status, relevance_score desc);
create index if not exists idx_hooks_brand_pillar on hooks(brand_id, emotional_pillar, performance_score desc);
create index if not exists idx_agent_logs_agent on agent_logs(agent_name, created_at desc);

-- ----------------------------------------------------------------
-- updated_at trigger
-- ----------------------------------------------------------------
create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_brands_updated on brands;
create trigger trg_brands_updated before update on brands
  for each row execute function set_updated_at();

drop trigger if exists trg_accounts_updated on accounts;
create trigger trg_accounts_updated before update on accounts
  for each row execute function set_updated_at();

drop trigger if exists trg_pipeline_updated on content_pipeline;
create trigger trg_pipeline_updated before update on content_pipeline
  for each row execute function set_updated_at();


-- >>> FILE: migrations/002_work_os.sql >>>
-- ============================================================
-- CAK AI Ecosystem — MIGRATION 002: WORK OS LAYER
-- Turns the platform into a company operating system:
-- team members, tasks + progress, dev issues / problem reports,
-- a cross-entity activity feed, and notifications.
-- Run AFTER 001_initial_schema.sql.
-- ============================================================

-- ----------------------------------------------------------------
-- TEAM MEMBERS — everyone who works in the platform (incl. devs)
-- ----------------------------------------------------------------
create table if not exists team_members (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  email text unique,
  -- lead | strategist | script_writer | creator | head_of_creator
  -- | account_monitor | developer | admin
  role text not null default 'strategist',
  avatar_url text,
  status text default 'active',           -- active | away | inactive
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ----------------------------------------------------------------
-- TASKS — the universal unit of work everyone tracks
-- ----------------------------------------------------------------
create table if not exists tasks (
  id uuid primary key default uuid_generate_v4(),
  brand_id uuid references brands(id) on delete set null,
  pipeline_id uuid references content_pipeline(id) on delete set null,

  title text not null,
  description text,
  -- content | strategy | script | production | qc | account | dev | general
  type text not null default 'general',
  -- backlog | todo | in_progress | blocked | review | done | cancelled
  status text not null default 'backlog',
  priority int default 3,                 -- 1=urgent .. 4=low
  progress int default 0,                 -- 0..100

  assignee_id uuid references team_members(id) on delete set null,
  created_by uuid references team_members(id) on delete set null,

  due_date timestamptz,
  started_at timestamptz,
  completed_at timestamptz,

  depends_on jsonb default '[]',          -- array of task ids (blockers)
  labels jsonb default '[]',
  ai_generated boolean default false,     -- was this task drafted by AI?

  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ----------------------------------------------------------------
-- TASK COMMENTS — discussion + handoff notes per task
-- ----------------------------------------------------------------
create table if not exists task_comments (
  id uuid primary key default uuid_generate_v4(),
  task_id uuid references tasks(id) on delete cascade,
  author_id uuid references team_members(id) on delete set null,
  body text not null,
  created_at timestamptz default now()
);

-- ----------------------------------------------------------------
-- DEV ISSUES — dev team board + anyone can report a problem here
-- ----------------------------------------------------------------
create table if not exists dev_issues (
  id uuid primary key default uuid_generate_v4(),
  title text not null,
  description text,
  severity text default 'medium',         -- low | medium | high | critical
  -- open | triaging | in_progress | blocked | resolved | closed
  status text default 'open',
  area text default 'general',            -- frontend | backend | agent | infra | data | general

  reported_by uuid references team_members(id) on delete set null,
  assignee_id uuid references team_members(id) on delete set null,
  task_id uuid references tasks(id) on delete set null,

  -- GitHub sync (optional)
  github_issue_number int,
  github_url text,
  github_state text,                      -- open | closed (mirror)

  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ----------------------------------------------------------------
-- ACTIVITY LOG — one feed Lead can watch across all teams
-- ----------------------------------------------------------------
create table if not exists activity_log (
  id uuid primary key default uuid_generate_v4(),
  actor_id uuid references team_members(id) on delete set null,
  entity_type text not null,              -- task | dev_issue | pipeline | account | comment
  entity_id uuid,
  action text not null,                   -- created | updated | status_changed | commented | completed
  summary text,
  brand_id uuid references brands(id) on delete set null,
  created_at timestamptz default now()
);

-- ----------------------------------------------------------------
-- NOTIFICATIONS — per-member inbox (assignments, mentions, alerts)
-- ----------------------------------------------------------------
create table if not exists notifications (
  id uuid primary key default uuid_generate_v4(),
  recipient_id uuid references team_members(id) on delete cascade,
  type text not null default 'info',      -- info | assignment | mention | alert
  title text not null,
  body text,
  link text,
  read boolean default false,
  created_at timestamptz default now()
);

-- ----------------------------------------------------------------
-- INDEXES
-- ----------------------------------------------------------------
create index if not exists idx_tasks_assignee_status on tasks(assignee_id, status);
create index if not exists idx_tasks_brand_status on tasks(brand_id, status);
create index if not exists idx_tasks_type_status on tasks(type, status);
create index if not exists idx_tasks_due on tasks(due_date);
create index if not exists idx_task_comments_task on task_comments(task_id, created_at);
create index if not exists idx_dev_issues_status on dev_issues(status, severity);
create index if not exists idx_dev_issues_assignee on dev_issues(assignee_id);
create index if not exists idx_activity_created on activity_log(created_at desc);
create index if not exists idx_activity_brand on activity_log(brand_id, created_at desc);
create index if not exists idx_notifications_recipient on notifications(recipient_id, read, created_at desc);

-- ----------------------------------------------------------------
-- updated_at triggers (reuse set_updated_at from 001)
-- ----------------------------------------------------------------
drop trigger if exists trg_team_members_updated on team_members;
create trigger trg_team_members_updated before update on team_members
  for each row execute function set_updated_at();

drop trigger if exists trg_tasks_updated on tasks;
create trigger trg_tasks_updated before update on tasks
  for each row execute function set_updated_at();

drop trigger if exists trg_dev_issues_updated on dev_issues;
create trigger trg_dev_issues_updated before update on dev_issues
  for each row execute function set_updated_at();


-- >>> FILE: migrations/003_integrations.sql >>>
-- ============================================================
-- CAK AI Ecosystem — MIGRATION 003: INTEGRATION LAYER
-- One platform that embeds external tools (Google Docs/Sheets/Drive,
-- TikTok, Instagram, YouTube, Social Growth Engineer, GitHub, Postiz).
-- Secrets live in env/secret manager — these tables store only
-- non-secret connection metadata + embedded resource references.
-- Run AFTER 002_work_os.sql.
-- ============================================================

-- ----------------------------------------------------------------
-- INTEGRATION CONNECTIONS — which external tools are wired up
-- ----------------------------------------------------------------
create table if not exists integration_connections (
  id uuid primary key default uuid_generate_v4(),
  -- google_docs | google_sheets | google_drive | tiktok | instagram
  -- | youtube | social_growth_engineer | github | postiz | analytics
  provider text not null,
  display_name text,
  status text default 'disconnected',     -- connected | disconnected | error
  account_label text,                     -- e.g. the connected account/handle
  config jsonb default '{}',              -- NON-SECRET config only
  last_synced_at timestamptz,
  last_error text,
  connected_by uuid references team_members(id) on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (provider, account_label)
);

-- ----------------------------------------------------------------
-- EMBEDDED RESOURCES — external docs/sheets/videos opened in-platform
-- ----------------------------------------------------------------
create table if not exists embedded_resources (
  id uuid primary key default uuid_generate_v4(),
  provider text not null,                 -- matches integration provider
  kind text not null,                     -- doc | sheet | drive_file | video | post | profile | board
  title text,
  external_url text not null,
  external_id text,
  thumbnail_url text,

  brand_id uuid references brands(id) on delete cascade,
  task_id uuid references tasks(id) on delete cascade,
  pipeline_id uuid references content_pipeline(id) on delete cascade,
  created_by uuid references team_members(id) on delete set null,

  created_at timestamptz default now()
);

-- ----------------------------------------------------------------
-- INDEXES
-- ----------------------------------------------------------------
create index if not exists idx_integrations_provider on integration_connections(provider, status);
create index if not exists idx_embedded_task on embedded_resources(task_id);
create index if not exists idx_embedded_pipeline on embedded_resources(pipeline_id);
create index if not exists idx_embedded_brand on embedded_resources(brand_id, provider);

-- ----------------------------------------------------------------
-- updated_at trigger
-- ----------------------------------------------------------------
drop trigger if exists trg_integrations_updated on integration_connections;
create trigger trg_integrations_updated before update on integration_connections
  for each row execute function set_updated_at();


-- >>> FILE: migrations/004_warmup.sql >>>
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


-- >>> FILE: migrations/005_account_connections.sql >>>
-- ============================================================
-- CAK AI Ecosystem — MIGRATION 005: ACCOUNT CONNECTIONS
-- Connect each real TikTok/IG account once, then reuse its session
-- (cookies) so warmup + scraping act AS that account via Lightpanda.
-- SECURITY: session_cookies / password are sensitive. Restrict access
-- to the service role only (RLS stays off here = service-role only) and
-- ideally encrypt at rest. Never expose to the browser/anon client.
-- Run AFTER 004_warmup.sql.
-- ============================================================

create table if not exists account_connections (
  id uuid primary key default uuid_generate_v4(),
  account_id uuid references accounts(id) on delete cascade,
  platform text not null,                 -- tiktok | instagram
  auth_method text not null default 'cookie',   -- cookie | credentials
  status text default 'connected',        -- connected | expired | disconnected | error

  -- cookie method: array of {name,value,domain,path,...} for page.setCookie
  session_cookies jsonb,
  -- credentials method (store encrypted in production!)
  username text,
  password_enc text,

  label text,
  last_error text,
  connected_at timestamptz default now(),
  last_verified_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),

  unique (account_id)
);

create index if not exists idx_account_connections_status on account_connections(status);

drop trigger if exists trg_account_connections_updated on account_connections;
create trigger trg_account_connections_updated before update on account_connections
  for each row execute function set_updated_at();


-- >>> FILE: migrations/006_copilot.sql >>>
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


-- >>> FILE: migrations/007_google_sync.sql >>>
-- ============================================================
-- CAK AI Ecosystem — MIGRATION 007: GOOGLE OAUTH + 2-WAY SYNC
-- Connect Google (Docs/Sheets/Drive) via OAuth, and link external
-- docs/sheets to platform records for bidirectional sync.
-- SECURITY: oauth_tokens holds access/refresh tokens — service-role
-- only, NEVER exposed to the browser. Encrypt at rest in production.
-- Run AFTER 006_copilot.sql.
-- ============================================================

create table if not exists oauth_tokens (
  id uuid primary key default uuid_generate_v4(),
  provider text not null,                 -- google
  account_email text,
  access_token text,
  refresh_token text,
  scope text,
  token_type text,
  expires_at timestamptz,
  connected_by uuid references team_members(id) on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (provider, account_email)
);

-- Links a Google Doc/Sheet to a platform record for 2-way sync.
create table if not exists sync_links (
  id uuid primary key default uuid_generate_v4(),
  kind text not null,                     -- doc | sheet
  external_id text not null,
  external_url text,

  -- what platform record this maps to (one of these is set)
  pipeline_id uuid references content_pipeline(id) on delete cascade,
  brand_id uuid references brands(id) on delete cascade,
  -- which field on the record the doc/sheet mirrors (e.g. script.text)
  field text default 'script',
  range text,                             -- A1 range for sheets

  -- sync bookkeeping
  last_remote_rev text,                   -- Drive revision / modifiedTime
  last_local_hash text,                   -- hash of the platform value
  last_synced_at timestamptz,
  last_direction text,                    -- pull | push | none | conflict
  status text default 'active',           -- active | paused | error
  last_error text,

  created_by uuid references team_members(id) on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_oauth_provider on oauth_tokens(provider);
create index if not exists idx_sync_links_status on sync_links(status);
create index if not exists idx_sync_links_pipeline on sync_links(pipeline_id);

drop trigger if exists trg_oauth_tokens_updated on oauth_tokens;
create trigger trg_oauth_tokens_updated before update on oauth_tokens
  for each row execute function set_updated_at();

drop trigger if exists trg_sync_links_updated on sync_links;
create trigger trg_sync_links_updated before update on sync_links
  for each row execute function set_updated_at();

