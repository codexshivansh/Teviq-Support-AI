-- Rollback for 0007_add_structured_knowledge_table.sql
-- Safe any time before app code depends on this table (Phase 2 only adds
-- the empty table; nothing reads/writes it yet).

drop index if exists public.structured_knowledge_brand_id_idx;
drop table if exists public.structured_knowledge;
