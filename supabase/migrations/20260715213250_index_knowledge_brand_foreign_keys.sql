create index if not exists knowledge_chunks_brand_id_idx
  on public.knowledge_chunks (brand_id);

create index if not exists knowledge_documents_brand_id_idx
  on public.knowledge_documents (brand_id);
