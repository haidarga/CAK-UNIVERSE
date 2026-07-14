-- ============================================================
-- MIGRATION 012: raise sw-imports bucket size limit for video uploads
-- (Content Translator now accepts short video clips, not just images/docs).
-- Same shared transient-upload bucket as briefs/naskah import — files are
-- always deleted right after processing, so a higher ceiling here doesn't
-- accumulate storage. 200 MB comfortably covers short-form video clips.
-- ============================================================
update storage.buckets set file_size_limit = 209715200 where id = 'sw-imports'; -- 200 MB
