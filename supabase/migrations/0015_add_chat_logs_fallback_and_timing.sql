-- Migration 0015: Add is_fallback and response_time_ms to chat_logs
-- (F5 Phase 2a — analytics write-path instrumentation)
--
-- Additive only. Both columns are write-time signals computed in
-- supportBrain.js at the exact point the final reply is decided, not
-- reverse-engineered later from source/knowledge_confidence heuristics.
--
-- Rollback: see 0015_rollback_add_chat_logs_fallback_and_timing.sql

alter table public.chat_logs
  add column if not exists is_fallback boolean not null default false,
  add column if not exists response_time_ms integer;
