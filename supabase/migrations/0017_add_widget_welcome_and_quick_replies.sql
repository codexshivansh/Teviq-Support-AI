-- Migration 0017: Add welcome_title, welcome_body, quick_replies to brands
-- (per-brand widget welcome card + quick-action customization)
--
-- Additive only. Today the widget's initial greeting card ("How can I
-- help? / I can help with orders, returns, warranty, and product
-- questions.") and its 4 quick-action buttons are hardcoded in
-- widget.js and identical for every brand — even though
-- /api/brand-config/:brandId already fetches (and widget.js silently
-- discards) a welcomeMessage/quickReplies shape. These columns let
-- brand.service.js populate that shape with real per-brand values.
--
-- welcome_title / welcome_body: nullable. Null (or empty string) means
-- "use the existing hardcoded default" — brand.service.js falls back
-- so brands that never set these keep today's behavior unchanged.
--
-- quick_replies: jsonb array of {label, message} objects, matching
-- widget.js's existing createAction(label, message) shape (label is
-- the button text shown, message is what gets sent when clicked).
-- Default '[]' — an empty array is the fallback trigger (use the
-- existing 4-item default list), not a valid "this brand wants zero
-- quick replies" state. No UI need for that yet.
--
-- Rollback: see 0017_rollback_add_widget_welcome_and_quick_replies.sql

alter table public.brands
  add column if not exists welcome_title text,
  add column if not exists welcome_body text,
  add column if not exists quick_replies jsonb not null default '[]'::jsonb;
