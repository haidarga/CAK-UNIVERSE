-- ============================================================
-- CAK AI Ecosystem — MIGRATION 009: SCRIPT WRITER STUDIO (CAKGPT port)
-- Replaces the old mock Script studio with the CAKGPT throughput engine:
-- import a content plan → fan out (brief × persona) → background jobs →
-- triage/QC → edit → Google Doc sync.
--
-- Design notes:
--   * Reuses existing `brands` (= the "client"/brand) and `personas`.
--   * Brand-scoped, NOT user-scoped — this app is service-role/no-RLS.
--   * All new tables are prefixed `sw_` (script writer) to avoid collisions.
--   * Personas are extended with CAKGPT voice fields (additive, nullable).
-- ============================================================

-- 1. Extend personas with the voice-profile fields CAKGPT generation + rule-QC need.
alter table if exists personas add column if not exists banned_words text[] default '{}';
alter table if exists personas add column if not exists required_words text[] default '{}';
alter table if exists personas add column if not exists sample_lines jsonb default '[]';
alter table if exists personas add column if not exists red_flags jsonb default '[]';
alter table if exists personas add column if not exists diction_quirks jsonb default '[]';
alter table if exists personas add column if not exists voice_tone jsonb default '{}';

-- 2. sw_briefs — a strategist brief / one row of a content plan.
create table if not exists sw_briefs (
  id           uuid primary key default uuid_generate_v4(),
  brand_id     uuid not null references brands(id) on delete cascade,
  persona_id   uuid references personas(id) on delete set null, -- suggested default persona
  title        text not null,
  product      text,
  platform     text,
  fields       jsonb not null default '{}',      -- freeform: week, day, topic, angle, cta, …
  status       text not null default 'ready' check (status in ('draft','ready','archived')),
  import_group text,                             -- content-plan label these were imported under
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists idx_sw_briefs_brand on sw_briefs(brand_id, created_at desc);
create index if not exists idx_sw_briefs_group on sw_briefs(import_group);

-- 3. sw_batches — one generation session (maps to one Google Doc).
create table if not exists sw_batches (
  id                uuid primary key default uuid_generate_v4(),
  brand_id          uuid not null references brands(id) on delete cascade,
  name              text not null,
  status            text not null default 'open' check (status in ('open','closed','exported')),
  external_doc_ref  jsonb,                        -- { doc_id, doc_url, last_pushed_at, … }
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  closed_at         timestamptz
);
create index if not exists idx_sw_batches_brand on sw_batches(brand_id, created_at desc);

-- 4. sw_naskah — stable script identity (current_version_id backfilled after versions table).
create table if not exists sw_naskah (
  id                 uuid primary key default uuid_generate_v4(),
  brand_id           uuid not null references brands(id) on delete cascade,
  batch_id           uuid references sw_batches(id) on delete set null,
  brief_id           uuid references sw_briefs(id) on delete set null,
  persona_id         uuid references personas(id) on delete set null,
  title              text,
  status             text not null default 'draft' check (status in ('draft','approved','rejected')),
  source             text not null default 'generated' check (source in ('generated','imported','promoted_from_idea')),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index if not exists idx_sw_naskah_brand_status on sw_naskah(brand_id, status, updated_at desc);
create index if not exists idx_sw_naskah_batch on sw_naskah(batch_id);

-- 5. sw_naskah_versions — append-only version history (block-based body).
create table if not exists sw_naskah_versions (
  id                  uuid primary key default uuid_generate_v4(),
  naskah_id           uuid not null references sw_naskah(id) on delete cascade,
  version_no          int not null,
  body                jsonb not null,             -- [{ block_id, section_key, shot_no, line_no, speaker?, timestamp_range?, text, visual_note? }]
  hook_type           text,
  hook_justification  text,
  format_meta         jsonb not null default '{}',
  generation_meta     jsonb,
  created_via         text not null check (created_via in ('ai_generation','ai_regeneration','writer_edit','doc_sync')),
  change_summary      text,
  created_at          timestamptz not null default now(),
  unique (naskah_id, version_no)
);
create index if not exists idx_sw_versions_latest on sw_naskah_versions(naskah_id, version_no desc);

alter table if exists sw_naskah
  add column if not exists current_version_id uuid references sw_naskah_versions(id) on delete set null;

-- 6. sw_qc_flags — per-block QC flags (never deleted; feeds precision/recall).
create table if not exists sw_qc_flags (
  id                  uuid primary key default uuid_generate_v4(),
  naskah_id           uuid not null references sw_naskah(id) on delete cascade,
  naskah_version_id   uuid not null references sw_naskah_versions(id) on delete cascade,
  target_ref          jsonb not null,
  category            text not null check (category in ('brief_adherence','persona_voice_deviation','generic_phrasing','banned_word','guardrail')),
  severity            text not null check (severity in ('blocker','warning','nit')),
  message             text not null,
  evidence            jsonb,
  source              text not null default 'auto_llm' check (source in ('auto_rule','auto_llm','manual')),
  status              text not null default 'open' check (status in ('open','resolved','dismissed')),
  created_at          timestamptz not null default now()
);
create index if not exists idx_sw_flags_version on sw_qc_flags(naskah_version_id, status, severity);

-- 7. sw_gen_jobs — background generation queue (fan-out one job per brief × persona).
create table if not exists sw_gen_jobs (
  id          uuid primary key default uuid_generate_v4(),
  brand_id    uuid not null references brands(id) on delete cascade,
  batch_id    uuid not null references sw_batches(id) on delete cascade,
  brief_id    uuid not null references sw_briefs(id) on delete cascade,
  persona_id  uuid references personas(id) on delete set null,
  status      text not null default 'pending' check (status in ('pending','running','done','failed')),
  attempts    int not null default 0,
  error       text,
  naskah_id   uuid references sw_naskah(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists idx_sw_jobs_batch_status on sw_gen_jobs(batch_id, status);

-- 8. RPC: atomic version insert (locks the naskah row so concurrent edits don't
--    both claim the same version_no), then updates current_version_id.
create or replace function sw_create_naskah_version(
  p_naskah_id uuid, p_body jsonb, p_hook_type text, p_hook_justification text,
  p_format_meta jsonb, p_generation_meta jsonb, p_created_via text, p_change_summary text
) returns sw_naskah_versions
language plpgsql
as $$
declare
  v_next int;
  v_version sw_naskah_versions;
begin
  perform 1 from sw_naskah where id = p_naskah_id for update;
  select coalesce(max(version_no), 0) + 1 into v_next from sw_naskah_versions where naskah_id = p_naskah_id;
  insert into sw_naskah_versions (naskah_id, version_no, body, hook_type, hook_justification, format_meta, generation_meta, created_via, change_summary)
  values (p_naskah_id, v_next, p_body, p_hook_type, p_hook_justification, coalesce(p_format_meta,'{}'::jsonb), p_generation_meta, p_created_via, p_change_summary)
  returning * into v_version;
  update sw_naskah set current_version_id = v_version.id, updated_at = now() where id = p_naskah_id;
  return v_version;
end;
$$;

-- 9. RPC: claim up to N pending jobs for a batch (also reclaims 'running' jobs
--    stuck >2 min). FOR UPDATE SKIP LOCKED so concurrent pumps never collide.
create or replace function sw_claim_gen_jobs(p_batch_id uuid, p_limit int)
returns setof sw_gen_jobs
language plpgsql
as $$
begin
  return query
  update sw_gen_jobs g set status = 'running', attempts = g.attempts + 1, updated_at = now()
  where g.id in (
    select j.id from sw_gen_jobs j
    where j.batch_id = p_batch_id
      and (j.status = 'pending' or (j.status = 'running' and j.updated_at < now() - interval '2 minutes'))
    order by j.created_at
    limit greatest(p_limit, 1)
    for update skip locked
  )
  returning g.*;
end;
$$;
