-- Migration 0009: Add conversation_states table (F1 Phase 3a — state machine)
--
-- Additive only. Tracks "where is this customer in the support journey"
-- per (brand, customer, channel), starting with the order-ID follow-up
-- use case (ARCHITECTURE_V2.md Section C/8).
--
-- Design notes:
--   - Composite primary key (brand_id, customer_id, channel), no surrogate
--     `id`. This is a "current state" table, not an append-only log — there
--     is exactly one row per conversation, upserted in place. A surrogate
--     key would add nothing here.
--   - context is a free-form jsonb bag (e.g. { pendingIntent: "order_tracking" }
--     or { orderId: "TVQ1001" }) so different states can carry whatever data
--     the resuming turn needs without further schema changes.
--   - No TTL/staleness column. Staleness (ignoring a stale
--     "collecting_order_id" from days ago) is enforced by the app layer
--     using `updated_at`, not the schema — this keeps the table itself
--     simple and matches how validation logic lives in the brain layer
--     elsewhere in this codebase (not in SQL).
--
-- Rollback: see 0009_rollback_add_conversation_states_table.sql

create table if not exists public.conversation_states (
  brand_id text not null references public.brands(id),
  customer_id text not null,
  channel text not null default 'widget',
  state text not null default 'idle' check (state in ('idle', 'collecting_order_id', 'order_found', 'checking_return', 'collecting_contact', 'escalated', 'resolved')),
  context jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (brand_id, customer_id, channel)
);
