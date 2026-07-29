-- Persist the multi-day series position ON the naskah, so lists can be sorted
-- by it. Without this the only record of "which day is this" lives in the
-- gen_job row (consumed and never read again) and inside the title string.
--
-- Why it matters: generation runs 12 jobs CONCURRENTLY, so naskah are created
-- in whatever order the model happens to finish. Every list that ordered by a
-- timestamp (the triage queue, the Google Doc push) therefore showed a series
-- scrambled — "Hari 3/5" above "Hari 1/5", one persona's days interleaved with
-- another's. Sorting needs a real numeric column; parsing it back out of the
-- title on every read would be both fragile and unsortable in SQL.
--
-- Backfill: naskah generated before this column existed already carry the day
-- in their title ("... · Hari 2/5"), so recover it rather than leaving the
-- existing batches permanently unsortable. Titles without that marker are
-- single-day naskah and correctly stay NULL.
-- Apply via Supabase SQL Editor after 016.

alter table sw_naskah add column if not exists day_no int;

update sw_naskah
set day_no = (regexp_match(title, 'Hari ([0-9]+)/[0-9]+'))[1]::int
where day_no is null
  and title ~ 'Hari [0-9]+/[0-9]+';
