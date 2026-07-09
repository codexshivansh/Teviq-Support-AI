-- Migration 0008: Add return_requests table (F1 Phase 1 — Return Initiation)
--
-- Additive only. No app code depends on this table yet (wiring is a later
-- phase). Tracks return requests initiated through the support brain before
-- (and after) they are submitted to Shopify via the returnRequest mutation.
--
-- Design notes:
--   - order_id is plain text, not a foreign key — orders are not in Supabase
--     yet (they live in local JSON / the Shopify demo connector). This
--     matches the diagnosis: no real `orders` table exists to reference.
--   - Added `line_items` (missing from the originally proposed schema) —
--     without it, there is no record of which fulfillment line items /
--     quantities were actually requested, so a failed Shopify submission
--     could never be audited, retried, or reconstructed.
--   - Added `metadata` for parity with knowledge_chunks/structured_knowledge
--     (both already have this column) — reserved for things like the raw
--     Shopify response, request origin (widget/dashboard), etc.
--
-- Rollback: see 0008_rollback_add_return_requests_table.sql

create table if not exists public.return_requests (
  id text primary key,
  brand_id text not null references public.brands(id),
  order_id text not null,
  customer_id text,
  reason_code text,
  customer_note text,
  line_items jsonb not null default '[]'::jsonb,
  status text not null default 'pending' check (status in ('pending', 'shopify_submitted', 'shopify_failed', 'approved', 'declined')),
  shopify_return_id text,
  shopify_error text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists return_requests_brand_id_idx on public.return_requests (brand_id);
create index if not exists return_requests_order_id_idx on public.return_requests (order_id);
