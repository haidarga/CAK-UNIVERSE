-- Studio integration — track push status on naskah + store connection settings in cakai-ecosystem.

-- 1. Add columns to sw_user_settings (scriptwriter user settings in cakai-ecosystem)
alter table sw_user_settings add column if not exists studio_api_key text;
alter table sw_user_settings add column if not exists studio_api_url text;

-- Also add to user_settings if present for backwards compatibility
alter table if exists user_settings add column if not exists studio_api_key text;
alter table if exists user_settings add column if not exists studio_api_url text;

-- 2. Track push status per naskah
alter table naskah add column if not exists studio_handoff jsonb;
-- Structure: { studio_job_ids: [uuid], pushed_at: timestamptz, status: 'pushed'|'generating'|'done'|'error' }

-- 3. Persist per-user persona mappings for auto-match fallback
create table if not exists persona_studio_mappings (
  id                  uuid primary key default gen_random_uuid(),
  created_by          uuid not null references auth.users(id) default auth.uid(),
  caketing_persona_id uuid not null references personas(id) on delete cascade,
  studio_persona_id   text not null,      -- UUID from Video Studio (different DB)
  studio_persona_name text,               -- cached name for display
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (created_by, caketing_persona_id)
);

create trigger trg_persona_studio_mappings_updated_at before update on persona_studio_mappings
  for each row execute function set_updated_at();

alter table persona_studio_mappings enable row level security;
create policy mappings_select on persona_studio_mappings for select using (created_by = auth.uid());
create policy mappings_insert on persona_studio_mappings for insert with check (created_by = auth.uid());
create policy mappings_update on persona_studio_mappings for update using (created_by = auth.uid()) with check (created_by = auth.uid());
create policy mappings_delete on persona_studio_mappings for delete using (created_by = auth.uid());
