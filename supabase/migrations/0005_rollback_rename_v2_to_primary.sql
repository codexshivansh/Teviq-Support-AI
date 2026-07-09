-- Rollback for 0005_rename_v2_to_primary.sql
-- Pure rename reversal — no data loss, safe to run any time after 0005.

alter table public.knowledge_chunks
  rename column embedding to embedding_v2;

create or replace function public.match_knowledge_chunks_v2(
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
    1 - (kc.embedding_v2 <=> p_query_embedding) as score
  from public.knowledge_chunks kc
  where kc.brand_id = p_brand_id
    and kc.embedding_v2 is not null
    and 1 - (kc.embedding_v2 <=> p_query_embedding) >= p_min_score
  order by kc.embedding_v2 <=> p_query_embedding
  limit p_match_count;
$$;

drop function if exists public.match_knowledge_chunks(text, vector(768), double precision, integer);
