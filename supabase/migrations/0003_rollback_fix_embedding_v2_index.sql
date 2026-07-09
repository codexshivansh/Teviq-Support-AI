-- Rollback for 0003_fix_embedding_v2_index.sql
-- Recreates the original (mis-sized) index exactly as migration 0001 left it.

create index if not exists knowledge_chunks_embedding_v2_idx
on public.knowledge_chunks
using ivfflat (embedding_v2 vector_cosine_ops)
with (lists = 100);
