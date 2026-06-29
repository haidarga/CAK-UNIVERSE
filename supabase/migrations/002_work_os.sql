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
