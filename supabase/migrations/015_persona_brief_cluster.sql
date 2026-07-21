-- Persona/brief "cluster" (audience segment) tagging — closes the gap that let
-- Import & Generate cross EVERY selected persona against EVERY brief with no
-- regard for voice fit (e.g. a Dad persona voicing a "Nutrition Mom Hook"
-- brief). Free text, not an enum/FK to a separate table: the writer's own
-- segment names ("Working Mom", "Nutrition Mom", "Dad Persona", ...) vary per
-- client and should stay flexible, matching how personas already use plain
-- text/jsonb for tone, quirks, etc. rather than a rigid taxonomy.
--
-- sw_personas.cluster: which audience segment this persona speaks for.
-- sw_strategist_briefs.cluster: which audience segment this brief targets —
-- set by the LLM extraction (best-effort, from the row's own title/content,
-- steered toward the caller's EXISTING persona cluster names) or edited by
-- the writer in the import preview before commit.
-- Apply via Supabase SQL Editor after 014.

alter table sw_personas add column if not exists cluster text;
alter table sw_strategist_briefs add column if not exists cluster text;

create index if not exists idx_sw_personas_cluster on sw_personas (cluster);
create index if not exists idx_sw_briefs_cluster on sw_strategist_briefs (cluster);
