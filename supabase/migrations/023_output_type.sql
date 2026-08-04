-- 023_output_type.sql
-- Output type: what ARTIFACT a naskah is — 'video', 'slideshow' (TikTok/IG
-- carousel) or 'article' (blog/SEO).
--
-- Sits above content_format: format ('talking_head', 'vlog') describes a kind
-- of VIDEO, output_type decides whether it is a video at all.
--
-- NULL means video. Every naskah created before this migration is a video
-- script, and resolveOutputType() falls back accordingly, so no backfill is
-- needed and old rows keep rendering exactly as they did.
--
-- Deliberately NOT a CHECK-constrained enum: adding a fourth type later would
-- then require another production migration, and the value is already validated
-- by resolveOutputType() on the way in and out.

alter table sw_gen_jobs
  add column if not exists output_type text;

alter table sw_naskah
  add column if not exists output_type text;

comment on column sw_naskah.output_type is
  'video | slideshow | article. NULL = video (pre-migration rows). Gates Push to Studio and the content-format picker.';
