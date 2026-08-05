-- 024_pakem_default.sql
-- Auto-matching a Script Pakem to a brief.
--
-- Auto works in two steps, both deterministic (no LLM call — picking one of
-- three options per brief would cost a model call per brief on a 40-brief run,
-- differ between runs, and leave no way to explain the choice):
--
--   1. Match the pakem's own rules against the brief's fields. The rules live
--      in structure->match_rules as "field: value" lines, so they need no
--      column of their own and stay editable in the same form as everything
--      else about a pakem.
--   2. Fall back to the brand's DEFAULT pakem — that is what this column is for.
--
-- Not enforced as "one default per client" by a constraint: the API clears the
-- previous default when a new one is set, and a partial unique index would turn
-- a UI race into a 500 instead of a last-write-wins.
alter table sw_script_pakem
  add column if not exists is_default boolean not null default false;

create index if not exists idx_sw_script_pakem_default
  on sw_script_pakem(client_id) where is_default and is_active;
