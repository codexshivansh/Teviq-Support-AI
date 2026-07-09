-- Migration 0002: Drop NOT NULL on legacy `embedding` column (Gemini cutover, Phase 5)
--
-- Reason: app code (vectorStore.service.js) no longer writes to the legacy 256-dim
-- `embedding` column on new inserts (Phase 5 cutover writes `embedding_v2` only).
-- The column still has a `not null` constraint from the original schema, which
-- blocks every new insert. This migration relaxes that constraint only.
--
-- Does NOT touch: existing data in `embedding`, `match_knowledge_chunks` function,
-- `knowledge_chunks_embedding_idx` index, or the new `embedding_v2` column/function.
--
-- Rollback: alter table public.knowledge_chunks alter column embedding set not null;
--   (only safe to roll back if every row still has a non-null `embedding` value)

alter table public.knowledge_chunks
  alter column embedding drop not null;
