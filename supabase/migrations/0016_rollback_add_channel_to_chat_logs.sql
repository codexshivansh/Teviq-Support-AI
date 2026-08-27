-- Rollback for 0016_add_channel_to_chat_logs.sql

drop index if exists idx_chat_logs_channel;

alter table public.chat_logs
  drop column if exists channel;
