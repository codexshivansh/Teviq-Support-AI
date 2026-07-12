-- Rollback for 0020_add_widget_theme_color.sql

alter table public.brands
  drop column if exists theme_color;
