-- 021_gen_jobs_content_format.sql
-- Content format ("tipe konten") carried through the generation queue.
--
-- Why a column and not a slice of extra_context: format is a LOCKED constraint
-- that drives its own prompt section, and the fan-out multiplies briefs ×
-- personas × formats. Packing it into the free-text steering field would make
-- it unqueryable and would put it back in exactly the soft-prose position that
-- caused "jadiin talking head sama vlog" to be ignored.
--
-- Values: a preset key ('talking_head', 'vlog', 'skit', 'voiceover_broll',
-- 'tutorial', 'ugc_review', 'reaction', 'street_interview') or free text the
-- writer typed. NULL = no format constraint (previous behavior, unchanged).

alter table sw_gen_jobs
  add column if not exists content_format text;

comment on column sw_gen_jobs.content_format is
  'Locked content format for this naskah — preset key or custom free text. NULL = unconstrained.';

-- Recorded on the naskah too so the queue/exports can show which format a
-- finished script was written as, and so a re-run reproduces it.
alter table sw_naskah
  add column if not exists content_format text;

comment on column sw_naskah.content_format is
  'The content format this naskah was generated as. NULL for naskah created before migration 021.';
