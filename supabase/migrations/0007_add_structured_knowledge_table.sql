-- Migration 0007: Add structured_knowledge table (Phase 2 of ephemeral-storage fix)
--
-- Purpose: replace backend/data/knowledge/structured-knowledge.json (wiped on
-- every Render deploy) with a persisted Supabase table. This is additive
-- only — app code (structuredKnowledge.service.js) is NOT touched by this
-- migration; that happens in a later phase once this table exists and has
-- been backfilled from the current JSON file.
--
-- Design notes (see diagnosis from the prior turn):
--   - Single table for both `faq` and `policy` types, discriminated by
--     `type`, mirroring the same pattern already used by `knowledge_chunks`
--     (source_type column). Both item types are queried identically today
--     (listItems, getStructuredStats), so one table is the right shape.
--   - Added `source` (missing from the originally proposed schema) — every
--     item in the current JSON file has this field (currently always
--     "manual"; metadata.futureSources hints it will vary later, e.g.
--     "shopify_policy_sync"). Dropping it would silently remove a field
--     that's currently present in every API response.
--   - CHECK constraint enforces the same per-type required fields that
--     validateFaqInput/validatePolicyInput already enforce at the app
--     layer (defense-in-depth at the DB level).
--
-- Rollback: see 0007_rollback_add_structured_knowledge_table.sql

create table if not exists public.structured_knowledge (
  id text primary key,
  brand_id text not null references public.brands(id),
  type text not null check (type in ('faq', 'policy')),
  source text not null default 'manual',
  question text,
  answer text,
  policy_type text,
  title text,
  content text,
  tags jsonb not null default '[]'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists structured_knowledge_brand_id_idx
on public.structured_knowledge (brand_id);

alter table public.structured_knowledge
  add constraint structured_knowledge_type_fields_check
  check (
    (type = 'faq' and question is not null and answer is not null)
    or
    (type = 'policy' and title is not null and content is not null and policy_type is not null)
  );
