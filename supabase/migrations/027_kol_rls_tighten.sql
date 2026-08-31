-- Tighten the KOL Finder RLS policies.
--
-- Migration 026 shipped `using (true) with check (true)` on all three tables:
-- RLS was enabled but restricted nothing, so any authenticated session that
-- talked to PostgREST directly — bypassing the app entirely — could read, edit
-- and delete every row, including other clients' shortlists.
--
-- WHY THE POLICIES BELOW ARE BLUNT RATHER THAN PER-USER
--
-- The obvious tightening is `created_by = auth.uid()`. It does not work here.
-- `requireUser()` in src/lib/cakgpt/auth.ts is a single-tenant shim that returns
-- a FIXED id (00000000-0000-4000-8000-000000000001) for every staff member, so
-- `created_by` is that constant on every row while `auth.uid()` is the real
-- Supabase user id. They can never match, and a policy named "own rows" would
-- silently mean "no rows" — a lie sitting in the schema.
--
-- So the honest version: these two tables are reachable ONLY through the API
-- routes, which use the service-role client and enforce client scoping in
-- application code. RLS enabled with no permissive policy denies everything
-- else, which is exactly the intent.
--
-- Nothing in the app reads these tables with a user JWT, so this cannot break
-- the feature. Safe to run more than once.

-- ── sw_kol_profiles ─────────────────────────────────────────────────────────
-- A shared cache of PUBLIC creator statistics, keyed by handle. Nothing here
-- belongs to one client, so authenticated read stays open — it is the same data
-- anyone can see on TikTok. Writes stay service-role only: a poisoned follower
-- count would quietly corrupt every future tier filter.
drop policy if exists sw_kol_profiles_auth_read on public.sw_kol_profiles;
create policy sw_kol_profiles_auth_read
  on public.sw_kol_profiles for select to authenticated using (true);

-- ── sw_kol_searches ─────────────────────────────────────────────────────────
-- Search history. No direct access; the app does not read it with a user JWT.
drop policy if exists sw_kol_searches_auth_all on public.sw_kol_searches;
drop policy if exists sw_kol_searches_own_read on public.sw_kol_searches;

-- ── sw_kol_shortlists ───────────────────────────────────────────────────────
-- The deliverable, and the table the application-level ownership hole was in.
-- A permissive policy here would hand back the same hole at the database layer:
-- any session could delete another client's shortlist by id.
drop policy if exists sw_kol_shortlists_auth_all on public.sw_kol_shortlists;
drop policy if exists sw_kol_shortlists_own_read on public.sw_kol_shortlists;

-- Belt and braces: RLS must stay ON, or dropping the policies above would open
-- the tables rather than close them.
alter table public.sw_kol_profiles enable row level security;
alter table public.sw_kol_searches enable row level security;
alter table public.sw_kol_shortlists enable row level security;
