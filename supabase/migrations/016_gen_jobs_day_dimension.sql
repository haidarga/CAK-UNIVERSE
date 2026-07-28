-- Multi-day fan-out: one topic (brief) x one persona can now produce several
-- naskah, one per "day", instead of exactly one. What makes each day DIFFERENT
-- is deliberately NOT encoded here — no hook rotation, no fixed funnel. The
-- writer drives it from the brief's own content (the uploaded content plan)
-- plus the free-text steering ("arahan"); the pipeline only tells the model
-- which day of how many it is writing, so it can follow that plan.
--
-- day_no / day_total are nullable: every pre-existing job (and any single-day
-- run, which stays the default) leaves them null and behaves exactly as before.
--
-- Why this needs a column at all: the enqueue route de-duplicates jobs within a
-- batch by (brief_id, persona_id). Without a third dimension, days 2..N of the
-- same brief x persona look like duplicates of day 1 and get silently dropped
-- on any retry — the day number has to be part of that identity.
-- Apply via Supabase SQL Editor after 015.

alter table sw_gen_jobs add column if not exists day_no int;
alter table sw_gen_jobs add column if not exists day_total int;

-- DB-level backstop for the enqueue de-duplication. The route already skips
-- items it has seen, but that check is a read-then-write on an in-memory Set:
-- two concurrent enqueues for the same batch (double-click, retry-on-timeout,
-- a second tab) can both read the same "existing" snapshot and both insert.
-- That was already possible before this migration; the day fan-out multiplies
-- the number of rows each such race can duplicate, and every duplicate is a
-- wasted Gemini call. NULLS NOT DISTINCT (Postgres 15+, same as 014) is
-- required because persona_id and day_no are BOTH nullable — under the default
-- NULLS DISTINCT every "no persona"/"single day" row would compare unequal to
-- every other and the constraint would never fire for exactly the common case.
-- Verified against live data before writing this: 0 existing duplicates, so
-- the index builds without any cleanup step.
create unique index if not exists uq_sw_gen_jobs_batch_brief_persona_day
  on sw_gen_jobs (batch_id, brief_id, persona_id, day_no) nulls not distinct;
