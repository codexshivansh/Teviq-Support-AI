-- Rollback for 0004_drop_legacy_embedding.sql
--
-- Recreates the dropped structures (column, index, function) EMPTY.
-- This does NOT restore the actual 256-dim vector values that were dropped —
-- those must be re-inserted per row from:
--   backend/scripts/backups/knowledge_chunks-backup-<timestamp>.json
-- (a small one-off script would be needed to PATCH each row's `embedding`
-- from that file, the same pattern as backend/scripts/backfill-embedding-v2.js).

alter table public.knowledge_chunks
  add column if not exists embedding vector(256);

create index if not exists knowledge_chunks_embedding_idx
on public.knowledge_chunks
using ivfflat (embedding vector_cosine_ops)
with (lists = 100);

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
