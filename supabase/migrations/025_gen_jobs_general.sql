-- 025_gen_jobs_general.sql
--
-- FIX: the "General" fan-out option (one naskah written to fit EVERY persona)
-- shipped writing sw_gen_jobs.general without the column ever being created, so
-- every enqueue failed with:
--   Could not find the 'general' column of 'sw_gen_jobs' in the schema cache
--
-- NOT NULL DEFAULT false so rows queued before this — and any client that omits
-- the field — behave exactly as they did: one naskah per persona.
alter table sw_gen_jobs
  add column if not exists general boolean not null default false;

-- Recorded on the naskah too. A general naskah has persona_id NULL, which is
-- otherwise indistinguishable from a naskah whose persona was deleted; this
-- flag is what lets the queue, the exports and a re-run tell the two apart.
alter table sw_naskah
  add column if not exists general boolean not null default false;

comment on column sw_naskah.general is
  'true = written for every persona at once (persona_id is NULL by design, not by data loss).';
