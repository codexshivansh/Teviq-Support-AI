create extension if not exists vector;

create table if not exists public.knowledge_chunks (
  id text primary key,
  brand_id text not null references public.brands(id),
  document_id text,
  source_id text,
  source_type text not null,
  text text not null,
  metadata jsonb not null default '{}',
  embedding vector(256) not null,
  created_at timestamptz default now()
);

create table if not exists public.knowledge_documents (
  document_id text primary key,
  brand_id text not null references public.brands(id),
  title text,
  source_name text,
  stored_file_name text,
  mime_type text,
  extension text,
  size_bytes bigint,
  uploaded_at timestamptz,
  chunk_count int,
  extraction jsonb
);

create index if not exists knowledge_chunks_embedding_idx
on public.knowledge_chunks
using ivfflat (embedding vector_cosine_ops)
with (lists = 100);

create index if not exists knowledge_chunks_brand_id_idx
on public.knowledge_chunks (brand_id);

create index if not exists knowledge_chunks_source_idx
on public.knowledge_chunks (brand_id, source_id, source_type);

create or replace function public.match_knowledge_chunks(
  p_brand_id text,
  p_query_embedding vector(256),
  p_min_score double precision,
  p_match_count integer
)
returns table (
  id text,
  brand_id text,
  document_id text,
  source_id text,
  source_type text,
  text text,
  metadata jsonb,
  created_at timestamptz,
  score double precision
)
language sql
stable
as $$
  select
    kc.id,
    kc.brand_id,
    kc.document_id,
    kc.source_id,
    kc.source_type,
    kc.text,
    kc.metadata,
    kc.created_at,
    1 - (kc.embedding <=> p_query_embedding) as score
  from public.knowledge_chunks kc
  where kc.brand_id = p_brand_id
    and 1 - (kc.embedding <=> p_query_embedding) >= p_min_score
  order by kc.embedding <=> p_query_embedding
  limit p_match_count;
$$;
