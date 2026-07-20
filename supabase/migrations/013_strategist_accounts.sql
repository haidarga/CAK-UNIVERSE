-- Strategist Mode — cached account intelligence (standalone feature, later
-- graftable onto Trend Radar). One row = one scraped+analyzed public account,
-- keyed by (created_by, platform, handle) so a re-run of the SAME account
-- updates the row instead of piling up duplicates. This cache is what keeps us
-- under the free-tier scraper quota (~100 calls/month): the orchestrator only
-- hits the scraper when `fetched_at` is older than the TTL, otherwise it serves
-- this row. `scraped`/`metrics`/`estimate` are stored as jsonb (their TS shapes
-- live in src/lib/strategist/types.ts) — schemaless on purpose since provider
-- payloads and the AI estimate evolve faster than a column set should.
--
-- Mirrors the clients/personas RLS convention exactly: created_by-scoped,
-- owner-only select/insert/update, no delete policy (a stale cache row is
-- overwritten on refresh, never hard-deleted by the user).
-- Apply via Supabase SQL Editor (paste + Run), same workflow as 0001-0009.

create table strategist_accounts (
  id          uuid primary key default gen_random_uuid(),
  created_by  uuid not null references auth.users(id) default auth.uid(),
  platform    text not null check (platform in ('tiktok', 'instagram')),
  -- Mirror the app-layer normalization (src/lib/strategist/url.ts): handles are
  -- lowercased and constrained to this charset before insert. Enforcing it at
  -- the DB too is defense-in-depth against a future writer that forgets to.
  handle      text not null check (handle ~ '^[a-z0-9._]{1,30}$'),
  url         text not null,
  scraped     jsonb not null,   -- normalized ScrapedAccount (raw public data)
  metrics     jsonb not null,   -- computed AccountMetrics (derived, deterministic)
  estimate    jsonb not null,   -- StrategistEstimate (AI-inferred, clearly "estimasi")
  provider    text,             -- which scraper adapter produced `scraped`
  model       text,             -- which LLM produced `estimate`
  fetched_at  timestamptz not null default now(),  -- drives cache TTL
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- One cached row per account per user; the orchestrator upserts on this key.
create unique index idx_strategist_accounts_key
  on strategist_accounts (created_by, platform, handle);

create trigger trg_strategist_accounts_updated_at before update on strategist_accounts
  for each row execute function set_updated_at();

-- ── RLS (identical pattern to clients: owner-scoped, no delete) ──────────────
-- NOTE: the current writer (src/app/api/strategist/route.ts) uses the
-- service-role client, which BYPASSES RLS — so today these policies are
-- defense-in-depth, not the primary boundary. Enforcement on that path is the
-- explicit `created_by = userId` filters in src/lib/strategist/index.ts
-- (readCache/upsertCache). Keep RLS enabled anyway: it's the real boundary the
-- moment any user-scoped (anon-key) client ever reads this table.
alter table strategist_accounts enable row level security;
create policy strategist_accounts_select on strategist_accounts for select using (created_by = auth.uid());
create policy strategist_accounts_insert on strategist_accounts for insert with check (created_by = auth.uid());
create policy strategist_accounts_update on strategist_accounts for update using (created_by = auth.uid()) with check (created_by = auth.uid());
-- no delete policy (default-deny) — cache rows are overwritten on refresh.
