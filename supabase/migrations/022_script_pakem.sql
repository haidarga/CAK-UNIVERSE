-- 022_script_pakem.sql
-- Script Pakem: a brand's house script structure, learned from a reference
-- script the client already approved.
--
-- A TABLE rather than another key on sw_clients.brand_context because a brand
-- keeps SEVERAL named pakem ("Hard Selling", "Edukasi", "Testimoni") and picks
-- one per generation run. A JSONB array would make that unqueryable and would
-- have no stable id to reference from a queued job.
--
-- No FK to auth.users on created_by — same as every other sw_* table, because
-- requireUser() returns a fixed app-level user id, not a Supabase auth row.

create table if not exists sw_script_pakem (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null default '00000000-0000-4000-8000-000000000001',
  client_id uuid not null references sw_clients(id) on delete cascade,
  name text not null,
  -- PakemStructureSchema: section_flow, shot_min, shot_max, hook_style,
  -- cta_style, pacing, extra_rules, detected_format, voice_sample.
  structure jsonb not null default '{}'::jsonb,
  -- The reference script it was extracted from, kept so the writer can re-run
  -- the extraction after editing without re-uploading the document.
  source_excerpt text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_sw_script_pakem_client on sw_script_pakem(client_id) where is_active;

drop trigger if exists trg_sw_script_pakem_updated_at on sw_script_pakem;
create trigger trg_sw_script_pakem_updated_at
  before update on sw_script_pakem
  for each row execute function sw_set_updated_at();

-- Which pakem a queued naskah was generated against. Nullable: no pakem picked
-- is the previous behavior, unchanged. ON DELETE SET NULL so removing a pakem
-- never blocks or rewrites history.
alter table sw_gen_jobs
  add column if not exists pakem_id uuid references sw_script_pakem(id) on delete set null;

alter table sw_naskah
  add column if not exists pakem_id uuid references sw_script_pakem(id) on delete set null;
