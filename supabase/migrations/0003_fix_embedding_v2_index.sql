-- Migration 0003: Fix mis-sized ivfflat index on embedding_v2 (Phase 6, Step 1)
--
-- Assessment: migration 0001 created `knowledge_chunks_embedding_v2_idx` with
-- `lists = 100`. pgvector's own guidance is `lists = rows / 1000` (min ~1) for
-- tables under 1M rows. At current scale (26 rows), `lists = 100` means most
-- clusters are empty or hold a single vector. This is not just a performance
-- nitpick: pgvector's ivfflat search only probes a small number of lists by
-- default (`probes = 1`), so an over-provisioned index can silently miss the
-- correct match and return wrong/incomplete results — a real recall risk, not
-- just a speed one.
--
-- Recommendation: at 26 rows, do not build an ANN index at all. A sequential
-- scan over 26 vectors is exact (100% recall) and takes well under a
-- millisecond — there is nothing for ivfflat to optimize yet. This migration
-- only drops the mis-sized index; it does not create a replacement.
--
-- Revisit this when the table reaches roughly 1,000+ rows per brand. At that
-- point, prefer an HNSW index (`vector_cosine_ops`, no `lists` tuning needed,
-- generally better recall/speed tradeoff than ivfflat) if your pgvector
-- version supports it, or ivfflat with `lists = rows / 1000` otherwise.
--
-- Rollback: see 0003_rollback_fix_embedding_v2_index.sql

drop index if exists public.knowledge_chunks_embedding_v2_idx;

-- Optional (commented out, not recommended at current scale):
-- create index if not exists knowledge_chunks_embedding_v2_idx
-- on public.knowledge_chunks
-- using ivfflat (embedding_v2 vector_cosine_ops)
-- with (lists = 1);
