-- Migration: 019_sw_knowledge.sql
-- Create Knowledge Base table sw_knowledge

create table if not exists public.sw_knowledge (
  id uuid primary key default gen_random_uuid(),
  created_by uuid references auth.users(id) on delete cascade not null,
  title text not null,
  content text not null,
  source_type text not null default 'manual',
  source_url text,
  tags text[] not null default '{}',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Index for fast user queries
create index if not exists idx_sw_knowledge_created_by on public.sw_knowledge(created_by);
create index if not exists idx_sw_knowledge_source_type on public.sw_knowledge(source_type);

-- RLS Policies
alter table public.sw_knowledge enable row level security;

drop policy if exists "Users can view their own knowledge items" on public.sw_knowledge;
create policy "Users can view their own knowledge items"
  on public.sw_knowledge for select
  using (auth.uid() = created_by);

drop policy if exists "Users can insert their own knowledge items" on public.sw_knowledge;
create policy "Users can insert their own knowledge items"
  on public.sw_knowledge for insert
  with check (auth.uid() = created_by);

drop policy if exists "Users can update their own knowledge items" on public.sw_knowledge;
create policy "Users can update their own knowledge items"
  on public.sw_knowledge for update
  using (auth.uid() = created_by);

drop policy if exists "Users can delete their own knowledge items" on public.sw_knowledge;
create policy "Users can delete their own knowledge items"
  on public.sw_knowledge for delete
  using (auth.uid() = created_by);
