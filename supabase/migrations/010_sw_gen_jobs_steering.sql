-- ============================================================
-- MIGRATION 010: writer steering ("arahan") on the bulk generate path.
-- Adds an optional free-text steering prompt carried per fan-out job so the
-- batch "Generate naskah" panel can shape how each naskah turns out. The
-- single-generate path already accepts it via request body. Idempotent.
-- sw_claim_gen_jobs returns `sw_gen_jobs.*` so the new column flows to the
-- process route with no RPC change.
-- ============================================================
alter table sw_gen_jobs add column if not exists extra_context text;
