-- Tighten the KOL Finder RLS policies.
--
-- Migration 026 shipped `using (true) with check (true)` on all three tables:
-- RLS was enabled but restricted nothing. The API routes all go through the
-- service-role client, which bypasses RLS entirely, so this changed nothing in
-- practice — but it left the tables wide open to any authenticated session that
-- talked to PostgREST directly with its own JWT rather than through the app.
--
-- No route depends on these policies, so tightening them cannot break the
-- feature. This is defence in depth, not a fix for a live break.
--
-- Safe to run more than once.

-- ── sw_kol_profiles ─────────────────────────────────────────────────────────
-- A shared cache of PUBLIC creator statistics, keyed by handle. Nothing here is
-- private to a client, so authenticated read stays open — but writes belong to
-- the service role only, since a poisoned follower count would silently corrupt
-- every future tier filter.
drop policy if exists sw_kol_profiles_auth_read on public.sw_kol_profiles;
create policy sw_kol_profiles_auth_read
  on public.sw_kol_profiles for select to authenticated using (true);

-- ── sw_kol_searches ─────────────────────────────────────────────────────────
-- Search history belongs to whoever ran it.
drop policy if exists sw_kol_searches_auth_all on public.sw_kol_searches;
create policy sw_kol_searches_own_read
  on public.sw_kol_searches for select to authenticated using (created_by = auth.uid());

-- ── sw_kol_shortlists ───────────────────────────────────────────────────────
-- The deliverable. Direct writes are removed entirely: every legitimate change
-- goes through the API route, which scopes by the active client. A permissive
-- policy here would let a session delete another client's shortlist by id —
-- the same hole that was just closed at the application layer.
drop policy if exists sw_kol_shortlists_auth_all on public.sw_kol_shortlists;
create policy sw_kol_shortlists_own_read
  on public.sw_kol_shortlists for select to authenticated using (created_by = auth.uid());
