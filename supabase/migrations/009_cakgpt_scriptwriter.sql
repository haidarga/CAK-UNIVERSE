-- ============================================================
-- MIGRATION 009: CAKGPT Script Writer Studio (standalone port)
-- Full CAKGPT schema brought in verbatim, adapted to the ecosystem:
--   * standalone tables, all prefixed `sw_` so they never collide with the
--     ecosystem's own tables (the ecosystem already has its own `personas`
--     etc. from 001 — CAKGPT keeps its OWN separate tables).
--   * single-tenant: created_by defaults to a fixed workspace id, no FK to
--     auth.users, no RLS (service-role only, like the rest of the ecosystem).
-- Idempotent: safe to re-run. Apply via Supabase SQL Editor.
-- ============================================================
create extension if not exists pgcrypto;

-- Fixed single-tenant workspace owner (matches SW_USER_ID in lib/cakgpt/auth.ts).

create or replace function sw_set_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

-- ── sw_clients ──
create table if not exists sw_clients (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null default '00000000-0000-4000-8000-000000000001',
  name text not null, notes text, is_active boolean not null default true,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
drop trigger if exists trg_sw_clients_updated_at on sw_clients;
create trigger trg_sw_clients_updated_at before update on sw_clients for each row execute function sw_set_updated_at();

-- ── sw_hook_rubrics (+ seed) ──
create table if not exists sw_hook_rubrics (
  id uuid primary key default gen_random_uuid(), slug text unique not null, name text not null,
  description text not null, example text not null, is_active boolean not null default true,
  sort_order int not null default 0, created_at timestamptz not null default now()
);
insert into sw_hook_rubrics (slug, name, description, example, sort_order) values
  ('pattern_interrupt','Pattern Interrupt','Opens with something unexpected that breaks scroll autopilot.','Gue baru aja ngelakuin hal paling bego dalam hidup gue.',1),
  ('question_hook','Rhetorical Question','Opens with a question the viewer must want answered.','Lo pernah gak sih ngerasa dikhianatin sama sendal jepit lo sendiri?',2),
  ('bold_claim','Bold Claim','Opens with a strong, specific, slightly controversial claim.','Ini produk paling overrated tahun ini, dan gue bisa buktiin.',3),
  ('relatable_pov','Relatable POV','Names a specific, hyper-relatable everyday situation.','POV: lo udah telat 10 menit tapi masih mikirin outfit.',4),
  ('cold_open','Cold Open','Drops straight into the middle of a scene with no setup.','(langsung adegan) "...dan itu terakhir kalinya gue percaya sama dia."',5),
  ('stat_hook','Stat Hook','Opens with a surprising number or statistic.','7 dari 10 orang salah pake produk ini, lo termasuk yang mana?',6),
  ('problem_agitate','Problem-Agitate','Names a common problem and twists the knife.','Kulit lo kusam bukan karena kurang tidur doang.',7),
  ('direct_callout','Direct Callout','Directly addresses a specific audience segment.','Yang kulitnya sensitif, merapat dulu sini.',8),
  ('curiosity_gap','Curiosity Gap','Promises a payoff without giving it away.','Ternyata alasan gue putus itu bukan yang lo kira.',9),
  ('story_tease','Story Tease','Teases a mini-narrative the rest resolves.','Ini cerita gimana gue hampir dipecat gara-gara satu produk ini.',10)
on conflict (slug) do nothing;

-- ── sw_personas ──
create table if not exists sw_personas (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null default '00000000-0000-4000-8000-000000000001',
  name text not null, tone jsonb not null default '{}', diction_quirks jsonb not null default '[]',
  banned_words text[] not null default '{}', required_words text[] not null default '{}',
  sample_lines jsonb not null default '[]', red_flags jsonb not null default '[]',
  gold_examples jsonb not null default '[]',
  is_active boolean not null default true, client_id uuid references sw_clients(id) on delete set null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
drop trigger if exists trg_sw_personas_updated_at on sw_personas;
create trigger trg_sw_personas_updated_at before update on sw_personas for each row execute function sw_set_updated_at();
create index if not exists idx_sw_personas_client on sw_personas(client_id);

-- ── sw_strategist_briefs ──
create table if not exists sw_strategist_briefs (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null default '00000000-0000-4000-8000-000000000001',
  title text not null, product text, platform text,
  persona_id uuid references sw_personas(id) on delete restrict,
  client_id uuid references sw_clients(id) on delete restrict,
  fields jsonb not null default '{}',
  status text not null default 'draft' check (status in ('draft','ready','archived')),
  source text not null default 'manual' check (source in ('manual','google_docs')),
  external_ref jsonb, import_group text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
drop trigger if exists trg_sw_briefs_updated_at on sw_strategist_briefs;
create trigger trg_sw_briefs_updated_at before update on sw_strategist_briefs for each row execute function sw_set_updated_at();
create index if not exists idx_sw_briefs_client on sw_strategist_briefs(client_id);
create index if not exists idx_sw_briefs_group on sw_strategist_briefs(import_group);

-- ── sw_batches ──
create table if not exists sw_batches (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null default '00000000-0000-4000-8000-000000000001',
  name text not null, status text not null default 'open' check (status in ('open','closed','exported')),
  external_doc_ref jsonb, client_id uuid references sw_clients(id) on delete restrict,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), closed_at timestamptz
);
drop trigger if exists trg_sw_batches_updated_at on sw_batches;
create trigger trg_sw_batches_updated_at before update on sw_batches for each row execute function sw_set_updated_at();
create index if not exists idx_sw_batches_client on sw_batches(client_id);

-- ── sw_idea_sessions ──
create table if not exists sw_idea_sessions (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null default '00000000-0000-4000-8000-000000000001',
  persona_id uuid references sw_personas(id) on delete set null,
  brief_id uuid references sw_strategist_briefs(id) on delete set null,
  client_id uuid references sw_clients(id) on delete set null,
  ad_hoc_context text, angles jsonb not null default '[]', created_at timestamptz not null default now()
);

-- ── sw_naskah ──
create table if not exists sw_naskah (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null default '00000000-0000-4000-8000-000000000001',
  batch_id uuid references sw_batches(id) on delete set null,
  brief_id uuid references sw_strategist_briefs(id) on delete restrict,
  persona_id uuid references sw_personas(id) on delete restrict,
  title text, status text not null default 'draft' check (status in ('draft','approved','rejected')),
  source text not null default 'generated' check (source in ('generated','promoted_from_idea')),
  source_idea_session_id uuid references sw_idea_sessions(id) on delete set null, source_idea_angle_no int,
  pipeline_handoff jsonb, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
drop trigger if exists trg_sw_naskah_updated_at on sw_naskah;
create trigger trg_sw_naskah_updated_at before update on sw_naskah for each row execute function sw_set_updated_at();
create index if not exists idx_sw_naskah_status on sw_naskah(status, created_at desc);
create index if not exists idx_sw_naskah_batch on sw_naskah(batch_id, status, updated_at desc);

-- ── sw_naskah_versions ──
create table if not exists sw_naskah_versions (
  id uuid primary key default gen_random_uuid(),
  naskah_id uuid not null references sw_naskah(id) on delete cascade,
  version_no int not null, body jsonb not null,
  hook_rubric_id uuid references sw_hook_rubrics(id) on delete restrict,
  hook_justification text, format_meta jsonb not null default '{}', generation_meta jsonb,
  created_via text not null check (created_via in ('ai_generation','ai_regeneration','writer_edit')),
  change_summary text, created_by uuid not null default '00000000-0000-4000-8000-000000000001',
  created_at timestamptz not null default now(), unique (naskah_id, version_no)
);
create index if not exists idx_sw_versions_latest on sw_naskah_versions(naskah_id, version_no desc);
-- Explicitly named FK so the PostgREST embed
-- `current_version:sw_naskah_versions!sw_naskah_current_version_id_fkey` resolves.
alter table sw_naskah add column if not exists current_version_id uuid;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'sw_naskah_current_version_id_fkey') then
    alter table sw_naskah add constraint sw_naskah_current_version_id_fkey
      foreign key (current_version_id) references sw_naskah_versions(id) on delete set null;
  end if;
end $$;

-- ── sw_qc_flags ──
create table if not exists sw_qc_flags (
  id uuid primary key default gen_random_uuid(),
  naskah_id uuid not null references sw_naskah(id) on delete cascade,
  naskah_version_id uuid not null references sw_naskah_versions(id) on delete cascade,
  target_ref jsonb not null,
  category text not null check (category in ('brief_adherence','persona_voice_deviation','generic_phrasing','banned_word')),
  severity text not null check (severity in ('blocker','warning','nit')),
  message text not null, evidence jsonb,
  source text not null default 'auto_llm' check (source in ('auto_rule','auto_llm','manual')),
  status text not null default 'open' check (status in ('open','resolved','dismissed')),
  resolved_by uuid, resolved_at timestamptz, created_at timestamptz not null default now()
);
create index if not exists idx_sw_flags_version on sw_qc_flags(naskah_version_id, status, severity);
create index if not exists idx_sw_flags_naskah on sw_qc_flags(naskah_id, status);

-- ── sw_gen_jobs ──
create table if not exists sw_gen_jobs (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null default '00000000-0000-4000-8000-000000000001',
  batch_id uuid not null references sw_batches(id) on delete cascade,
  brief_id uuid not null references sw_strategist_briefs(id) on delete cascade,
  persona_id uuid references sw_personas(id) on delete set null,
  status text not null default 'pending' check (status in ('pending','running','done','failed')),
  attempts int not null default 0, error text, naskah_id uuid references sw_naskah(id) on delete set null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
drop trigger if exists trg_sw_gen_jobs_updated_at on sw_gen_jobs;
create trigger trg_sw_gen_jobs_updated_at before update on sw_gen_jobs for each row execute function sw_set_updated_at();
create index if not exists idx_sw_gen_jobs_batch on sw_gen_jobs(batch_id, status);

-- ── sw_user_settings ──
create table if not exists sw_user_settings (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null unique default '00000000-0000-4000-8000-000000000001',
  gemini_api_key text, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

-- ── RPCs (plain functions; the ecosystem calls them via the service-role admin client) ──
create or replace function sw_create_naskah_version(
  p_naskah_id uuid, p_body jsonb, p_hook_rubric_id uuid, p_hook_justification text,
  p_format_meta jsonb, p_generation_meta jsonb, p_created_via text, p_change_summary text, p_created_by uuid
) returns sw_naskah_versions language plpgsql as $$
declare v_next int; v_version sw_naskah_versions;
begin
  perform 1 from sw_naskah where id = p_naskah_id for update;
  select coalesce(max(version_no),0)+1 into v_next from sw_naskah_versions where naskah_id = p_naskah_id;
  insert into sw_naskah_versions (naskah_id, version_no, body, hook_rubric_id, hook_justification, format_meta, generation_meta, created_via, change_summary, created_by)
  values (p_naskah_id, v_next, p_body, p_hook_rubric_id, p_hook_justification, coalesce(p_format_meta,'{}'::jsonb), p_generation_meta, p_created_via, p_change_summary, coalesce(p_created_by,'00000000-0000-4000-8000-000000000001'))
  returning * into v_version;
  update sw_naskah set current_version_id = v_version.id, updated_at = now() where id = p_naskah_id;
  return v_version;
end; $$;

create or replace function sw_claim_gen_jobs(p_batch_id uuid, p_created_by uuid, p_limit int)
returns setof sw_gen_jobs language plpgsql as $$
begin
  return query
  update sw_gen_jobs g set status='running', attempts=g.attempts+1, updated_at=now()
  where g.id in (
    select j.id from sw_gen_jobs j
    where j.batch_id = p_batch_id and (j.status='pending' or (j.status='running' and j.updated_at < now() - interval '2 minutes'))
    order by j.created_at limit greatest(p_limit,1) for update skip locked
  ) returning g.*;
end; $$;

create or replace function sw_lock_batch_client(p_batch_id uuid, p_created_by uuid, p_candidate_client_id uuid)
returns uuid language plpgsql as $$
declare v_current uuid;
begin
  select client_id into v_current from sw_batches where id = p_batch_id for update;
  if p_candidate_client_id is null then return v_current; end if;
  if v_current is null then update sw_batches set client_id = p_candidate_client_id where id = p_batch_id; return p_candidate_client_id; end if;
  if v_current <> p_candidate_client_id then raise exception 'batch_client_conflict'; end if;
  return v_current;
end; $$;
