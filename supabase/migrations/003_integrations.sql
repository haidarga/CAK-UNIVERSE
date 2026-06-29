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
