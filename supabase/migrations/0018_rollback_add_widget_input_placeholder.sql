-- Rollback for 0018_add_widget_input_placeholder.sql

alter table public.brands
  drop column if exists input_placeholder;
