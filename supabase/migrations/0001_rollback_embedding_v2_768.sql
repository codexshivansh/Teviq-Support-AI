-- Rollback for 0001_add_embedding_v2_768.sql
--
-- Only drops the additive v2 objects. Never touches the original
-- `embedding` column, `match_knowledge_chunks` function, or its index.

drop index if exists public.knowledge_chunks_embedding_v2_idx;
drop function if exists public.match_knowledge_chunks_v2(text, vector(768), double precision, integer);
alter table public.knowledge_chunks drop column if exists embedding_v2;
