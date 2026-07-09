-- Rollback for 0012_add_delay_alerts_sent_table.sql
-- Safe any time before app code depends on this table.

drop table if exists public.delay_alerts_sent;
