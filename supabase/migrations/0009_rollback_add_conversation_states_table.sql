-- Rollback for 0009_add_conversation_states_table.sql
-- Safe any time before app code depends on this table.

drop table if exists public.conversation_states;
