-- Additive zero-downtime migration from Gemini Embedding 1 to Embedding 2.
-- Existing `embedding` vectors remain available to the currently deployed app
-- until `embedding_v3` has been backfilled and the new backend is deployed.

alter table public.knowledge_chunks
  add column if not exists embedding_v3 vector(768);

create or replace function public.match_knowledge_chunks_v3(
  p_brand_id text,
  p_query_embedding vector(768),
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
security invoker
set search_path = ''
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
    1 - (kc.embedding_v3 operator(public.<=>) p_query_embedding) as score
  from public.knowledge_chunks kc
  where kc.brand_id = p_brand_id
    and kc.embedding_v3 is not null
    and 1 - (kc.embedding_v3 operator(public.<=>) p_query_embedding) >= p_min_score
  order by kc.embedding_v3 operator(public.<=>) p_query_embedding
  limit p_match_count;
$$;

revoke all on function public.match_knowledge_chunks_v3(text, vector, double precision, integer)
  from public, anon, authenticated;
grant execute on function public.match_knowledge_chunks_v3(text, vector, double precision, integer)
  to service_role;

create index if not exists knowledge_chunks_embedding_v3_idx
  on public.knowledge_chunks
  using hnsw (embedding_v3 vector_cosine_ops);
