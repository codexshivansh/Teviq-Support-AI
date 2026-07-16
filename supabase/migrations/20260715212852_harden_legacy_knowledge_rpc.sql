create or replace function public.match_knowledge_chunks(
  p_brand_id text,
  p_query_embedding vector,
  p_min_score double precision,
  p_match_count integer
)
returns table(
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
    1 - (kc.embedding operator(public.<=>) p_query_embedding) as score
  from public.knowledge_chunks kc
  where kc.brand_id = p_brand_id
    and kc.embedding is not null
    and 1 - (kc.embedding operator(public.<=>) p_query_embedding) >= p_min_score
  order by kc.embedding operator(public.<=>) p_query_embedding
  limit p_match_count;
$$;

revoke execute on function public.match_knowledge_chunks(text, vector, double precision, integer)
  from public, anon, authenticated;
grant execute on function public.match_knowledge_chunks(text, vector, double precision, integer)
  to service_role;
