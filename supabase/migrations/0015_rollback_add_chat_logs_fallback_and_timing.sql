-- Rollback for 0015_add_chat_logs_fallback_and_timing.sql

alter table public.chat_logs
  drop column if exists is_fallback,
  drop column if exists response_time_ms;
