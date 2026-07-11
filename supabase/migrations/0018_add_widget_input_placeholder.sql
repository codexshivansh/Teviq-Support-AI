-- Migration 0018: Add input_placeholder to brands
-- (per-brand widget text-input placeholder — companion to 0017's
-- welcome_title/welcome_body/quick_replies)
--
-- Additive only. The widget's message input placeholder ("Ask about
-- orders, returns, size...") is currently hardcoded in widget.js and
-- identical for every brand. Same pattern as 0017: null means "use the
-- existing hardcoded default", so brands that never set this keep
-- today's behavior unchanged.
--
-- Rollback: see 0018_rollback_add_widget_input_placeholder.sql

alter table public.brands
  add column if not exists input_placeholder text;
