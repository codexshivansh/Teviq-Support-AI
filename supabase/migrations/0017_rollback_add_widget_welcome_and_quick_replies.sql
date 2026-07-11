-- Rollback for 0017_add_widget_welcome_and_quick_replies.sql

alter table public.brands
  drop column if exists welcome_title,
  drop column if exists welcome_body,
  drop column if exists quick_replies;
