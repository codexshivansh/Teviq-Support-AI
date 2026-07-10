-- Migration 0016: Add cart_recovery_alerts_sent table (F6 Phase 2 — idempotency)
--
-- Additive. Mirrors migration 0012 (delay_alerts_sent) exactly, keyed on
-- cart_id instead of order_id — tracks which carts have already had an
-- abandoned-cart SMS attempted, so a repeated cart-recovery-check run
-- never sends the same customer the same nudge twice for the same cart.
--
-- Design: same as 0012 — presence of a row for (brand_id, cart_id),
-- regardless of its `status`, means "do not act on this cart again". No
-- retry-on-failure logic yet; out of scope for this phase.
--
-- `status` distinguishes *why* no further action should be taken:
--   - 'sent': Twilio actually sent the SMS.
--   - 'skipped_not_configured': Twilio wasn't configured; logged only.
--   - 'failed': Twilio was configured but the send itself failed.
--
-- Rollback: see 0016_rollback_add_cart_recovery_alerts_sent_table.sql

create table if not exists public.cart_recovery_alerts_sent (
  brand_id text not null references public.brands(id),
  cart_id text not null,
  customer_phone text,
  status text not null default 'sent' check (status in ('sent', 'skipped_not_configured', 'failed')),
  error_message text,
  sent_at timestamptz not null default now(),
  primary key (brand_id, cart_id)
);
