-- Rollback for 0014_add_chat_logs_table.sql
-- Drops the table entirely — only safe if you're fine losing any chat_logs
-- rows already written (this is a log table, not user-facing state, so
-- there is no "in-progress work" risk the way there is for return_requests
-- or conversation_states).

drop index if exists public.chat_logs_created_at_idx;
drop index if exists public.chat_logs_brand_id_idx;
drop table if exists public.chat_logs;
