-- Scope the Strategist cache per client workspace, matching how sw_clients scopes
-- briefs/batches, so each brand's analyses stay isolated ("gak niban"). The cache
-- key gains client_id:
--   client_id = <uuid>  → belongs to that workspace
--   client_id = NULL    → the "All clients" / no-workspace state
-- NULLS NOT DISTINCT (Postgres 15+) keeps NULL a SINGLE row per account instead
-- of letting duplicate NULL-client rows accumulate (plain unique indexes treat
-- every NULL as distinct). ON DELETE CASCADE: a cache is disposable, so dropping
-- a client drops its cached analyses with it.
-- Apply via Supabase SQL Editor after 013.

alter table strategist_accounts
  add column client_id uuid references sw_clients(id) on delete cascade;

-- Replace the old (created_by, platform, handle) key with a client-scoped one.
drop index if exists idx_strategist_accounts_key;
create unique index idx_strategist_accounts_key
  on strategist_accounts (created_by, client_id, platform, handle) nulls not distinct;

create index idx_strategist_accounts_client on strategist_accounts (client_id);
