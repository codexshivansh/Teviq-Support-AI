-- Migration 0004: Drop legacy 256-dim embedding infrastructure (Phase 6, Step 2)
--
-- Safe now: Phase 5 cutover moved both the write path (vectorStore.service.js
-- upserts) and the read path (search() RPC call) onto embedding_v2 /
-- match_knowledge_chunks_v2. The legacy `embedding` column has been NULL for
-- all new rows since Phase 5 and is no longer read by any app code path.
--
-- IMPORTANT: this migration is destructive. The legacy `embedding` column's
-- data (256-dim hash embeddings) will be permanently dropped. A full backup
-- of every row (including the `embedding` column) was taken before Phase 3
-- migration work began:
--   backend/scripts/backups/knowledge_chunks-backup-<timestamp>.json
-- Confirm that backup still exists before running this migration.
--
-- Rollback: see 0004_rollback_drop_legacy_embedding.sql (recreates empty
-- structure only — restoring actual vector values requires re-inserting them
-- from the backup JSON above).

drop function if exists public.match_knowledge_chunks(text, vector(256), double precision, integer);
drop index if exists public.knowledge_chunks_embedding_idx;

alter table public.knowledge_chunks
  drop column if exists embedding;
