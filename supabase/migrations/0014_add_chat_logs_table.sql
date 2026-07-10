-- Migration 0014: Add chat_logs table (F5 Phase 1 — ephemeral-storage fix)
--
-- Additive only. Replaces backend/logs/chat-logs.json, a local-filesystem
-- log that gets wiped on every Render redeploy/restart (same ephemeral-
-- storage risk already fixed for structured_knowledge and return_requests).
--
-- Design notes:
--   - uuid primary key (gen_random_uuid()) since this is an append-only
--     event log, not a "current state" table — no natural composite key
--     the way conversation_states has one.
--   - No partitioning/retention policy yet. At current demo-brand volume
--     this table grows slowly; partitioning now would be tuning for a
--     scale that doesn't exist. Revisit once real production traffic
--     makes the table large enough for it to matter.
--
-- Rollback: see 0014_rollback_add_chat_logs_table.sql

create table if not exists public.chat_logs (
  id uuid primary key default gen_random_uuid(),
  brand_id text not null references public.brands(id),
  customer_id text,
  message text,
  detected_intent text,
  escalated boolean not null default false,
  source text,
  reply text,
  knowledge_confidence double precision,
  knowledge_citations jsonb default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists chat_logs_brand_id_idx on public.chat_logs (brand_id);
create index if not exists chat_logs_created_at_idx on public.chat_logs (created_at);
