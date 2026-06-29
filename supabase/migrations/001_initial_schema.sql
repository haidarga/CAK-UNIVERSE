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
