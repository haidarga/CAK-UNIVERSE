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
