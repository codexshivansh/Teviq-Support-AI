-- Rollback for 0006_drop_leftover_legacy_function.sql
--
-- WARNING: this recreates the mis-ordered overload and will reintroduce the
-- PGRST203 "ambiguous function" error on every match_knowledge_chunks call.
-- Only run this if you have a specific reason to restore the exact prior
-- (broken) state. There is no legitimate reason to run this in normal use.

create or replace function public.match_knowledge_chunks(
  p_brand_id text,
  p_query_embedding vector,
  p_match_count integer,
  p_min_score double precision
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
    and kc.embedding is not null
    and 1 - (kc.embedding <=> p_query_embedding) >= p_min_score
  order by kc.embedding <=> p_query_embedding
  limit p_match_count;
$$;
