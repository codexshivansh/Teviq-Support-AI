-- Migration 0005: Rename embedding_v2 -> embedding (Phase 6, Step 3)
--
-- Must run AFTER 0004 (which frees up the `embedding` name by dropping the
-- legacy column). Running this before 0004 will fail with a duplicate
-- column/function name error.
--
-- Note on the function: `ALTER FUNCTION ... RENAME TO ...` only renames the
-- function's catalog entry — it does NOT rewrite the function's SQL body.
-- Since match_knowledge_chunks_v2's body still says `kc.embedding_v2`
-- literally, a simple rename would leave the function referencing a column
-- name that stops existing (renamed to `embedding` below), and it would
-- fail on next call. So this migration recreates the function under its
-- final name with the body pointed at the renamed column, then drops the
-- old-named v2 function.
--
-- Rollback: see 0005_rollback_rename_v2_to_primary.sql

alter table public.knowledge_chunks
  rename column embedding_v2 to embedding;

create or replace function public.match_knowledge_chunks(
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
    1 - (kc.embedding <=> p_query_embedding) as score
  from public.knowledge_chunks kc
  where kc.brand_id = p_brand_id
    and kc.embedding is not null
    and 1 - (kc.embedding <=> p_query_embedding) >= p_min_score
  order by kc.embedding <=> p_query_embedding
  limit p_match_count;
$$;

drop function if exists public.match_knowledge_chunks_v2(text, vector(768), double precision, integer);

-- If you created an index in migration 0003 (not recommended at current
-- scale — see that file's comments), rename it here for naming consistency:
-- alter index if exists public.knowledge_chunks_embedding_v2_idx
--   rename to knowledge_chunks_embedding_idx;
