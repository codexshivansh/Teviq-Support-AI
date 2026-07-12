-- Migration 0020: Add theme_color to brands
--
-- Additive only. Same gap as 0017/0018/0019: the dashboard's "Widget
-- theme" color picker has never had a column to save into, so
-- normalizeBrand() has always returned a hardcoded "#0f172a" regardless
-- of what a brand owner picks. Null means "use the existing hardcoded
-- default" — brands that never set this keep today's color unchanged.
--
-- Rollback: see 0020_rollback_add_widget_theme_color.sql

alter table public.brands
  add column if not exists theme_color text;
