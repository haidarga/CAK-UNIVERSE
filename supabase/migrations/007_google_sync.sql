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
