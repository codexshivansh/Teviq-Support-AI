-- Migration 0012: Add delay_alerts_sent table (F3 Phase 2 — idempotency)
--
-- Additive. Tracks which orders have already had a delay alert attempted,
-- so a repeated delay-check run (whether via node-cron or a Render Cron
-- Job hitting an internal endpoint) never sends the same customer the same
-- alert twice for the same order.
--
-- Design: intentionally simple per current scope — presence of a row for
-- (brand_id, order_id), regardless of its `status`, means "do not act on
-- this order again". There is no retry-on-failure or
-- new-delay-threshold-crossed logic yet; that would need a richer model
-- (e.g. multiple rows per order, or a threshold-crossed column) and is
-- explicitly out of scope for this phase.
--
-- `status` distinguishes *why* no further action should be taken:
--   - 'sent': Twilio actually sent the SMS.
--   - 'skipped_not_configured': Twilio wasn't configured; logged only.
--     Still recorded so the cron doesn't re-log "would have sent" for the
--     same order on every future run.
--   - 'failed': Twilio was configured but the send itself failed.
--
-- Rollback: see 0012_rollback_add_delay_alerts_sent_table.sql

create table if not exists public.delay_alerts_sent (
  brand_id text not null references public.brands(id),
  order_id text not null,
  customer_phone text,
  status text not null default 'sent' check (status in ('sent', 'skipped_not_configured', 'failed')),
  error_message text,
  sent_at timestamptz not null default now(),
  primary key (brand_id, order_id)
);
