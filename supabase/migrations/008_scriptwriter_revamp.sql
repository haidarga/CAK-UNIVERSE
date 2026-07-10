-- ============================================================
-- CAK AI Ecosystem — MIGRATION 008: SCRIPTWRITER REVAMP
-- Adds few-shot prompting support, benchmarking, and block-based scripts
-- ============================================================

-- 1. Add gold_examples to personas for few-shot prompting
alter table if exists personas
  add column if not exists gold_examples jsonb default '[]';

-- 2. Content Benchmarks for Reverse-Engineering (Sosmed Translator)
create table if not exists content_benchmarks (
  id uuid primary key default uuid_generate_v4(),
  brand_id uuid references brands(id) on delete set null,
  
  source_url text not null,
  platform text,
  
  -- Extracted data by Gemini Multimodal
  extracted_topic text,
  extracted_angle text,
  extracted_hook text,
  extracted_cta text,
  shot_breakdown jsonb default '[]',
  
  created_at timestamptz default now()
);

create index if not exists idx_content_benchmarks_brand on content_benchmarks(brand_id, created_at desc);

-- Note on content_pipeline.script:
-- Previously it was assumed to be { text: string, version: int }.
-- Now it will be an array of blocks: 
-- [ { id: string, type: 'hook'|'body'|'cta', text: string }, ... ]
-- JSONB columns don't require schema changes to hold new structured data.
