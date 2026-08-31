-- KOL Finder ("Mencari KOL yang Hilang")
--
-- Three tables, three different lifetimes:
--
--   sw_kol_profiles   a growing cache of every creator ever scraped. The point
--                     of the feature over time: the first search in a niche is
--                     slow, every later one is mostly free, and after a few
--                     months this is a private Indonesian KOL index that can be
--                     re-filtered by tier/region without touching the API.
--   sw_kol_searches   an audit trail of what was asked and what came back, so a
--                     shortlist can always be traced to the query that made it.
--   sw_kol_shortlists  the actual deliverable: a named, curated set per client.
--
-- Additive only. No table is dropped or altered.

-- ── Creator cache ───────────────────────────────────────────────────────────
create table if not exists public.sw_kol_profiles (
  id uuid primary key default gen_random_uuid(),
  platform text not null default 'tiktok',
  handle text not null,
  display_name text,
  bio text,
  -- Nullable on purpose: an unread follower count and a genuinely empty account
  -- mean opposite things, and only one of them belongs in a tier bucket.
  followers bigint,
  following bigint,
  total_videos bigint,
  total_hearts bigint,
  -- ISO country code only. The provider has no province data; anything more
  -- specific is a guess and lives in the search snapshot, never here.
  country text,
  verified boolean not null default false,
  is_private boolean not null default false,
  avatar_url text,
  instagram_handle text,
  profile_url text,
  -- Derived performance from the creator's OWN recent feed, never from a
  -- hashtag feed (which is ranked by virality and inverts the truth).
  perf jsonb,
  scraped_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (platform, handle)
);

create index if not exists sw_kol_profiles_followers_idx on public.sw_kol_profiles (platform, followers desc nulls last);
create index if not exists sw_kol_profiles_country_idx on public.sw_kol_profiles (platform, country);
create index if not exists sw_kol_profiles_scraped_idx on public.sw_kol_profiles (scraped_at desc);

-- ── Search history ──────────────────────────────────────────────────────────
create table if not exists public.sw_kol_searches (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references public.sw_clients(id) on delete set null,
  created_by uuid,
  platform text not null default 'tiktok',
  query text not null,
  tiers text[] not null default '{}',
  region text,
  country text,
  depth text not null default 'standar',
  max_days_inactive integer,
  -- The full response, including meta. Kept so a shortlist made last month can
  -- still show the numbers it was actually chosen on.
  result jsonb,
  result_count integer not null default 0,
  elapsed_ms integer,
  created_at timestamptz not null default now()
);

create index if not exists sw_kol_searches_client_idx on public.sw_kol_searches (client_id, created_at desc);

-- ── Shortlists ──────────────────────────────────────────────────────────────
create table if not exists public.sw_kol_shortlists (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references public.sw_clients(id) on delete cascade,
  name text not null,
  note text,
  -- Snapshot of the chosen creators AS THEY WERE when picked. Deliberately not
  -- a list of foreign keys: follower counts move, and a shortlist has to stay
  -- an accurate record of the decision that was made.
  entries jsonb not null default '[]'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists sw_kol_shortlists_client_idx on public.sw_kol_shortlists (client_id, updated_at desc);

-- ── RLS ─────────────────────────────────────────────────────────────────────
alter table public.sw_kol_profiles enable row level security;
alter table public.sw_kol_searches enable row level security;
alter table public.sw_kol_shortlists enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'sw_kol_profiles' and policyname = 'sw_kol_profiles_auth_read') then
    create policy sw_kol_profiles_auth_read on public.sw_kol_profiles for select to authenticated using (true);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'sw_kol_searches' and policyname = 'sw_kol_searches_auth_all') then
    create policy sw_kol_searches_auth_all on public.sw_kol_searches for all to authenticated using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'sw_kol_shortlists' and policyname = 'sw_kol_shortlists_auth_all') then
    create policy sw_kol_shortlists_auth_all on public.sw_kol_shortlists for all to authenticated using (true) with check (true);
  end if;
end $$;
