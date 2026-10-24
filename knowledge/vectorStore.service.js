const vectorStorePath = "supabase:knowledge_chunks";

function getSupabaseConfig() {
  const url = String(process.env.SUPABASE_URL || "").replace(/\/$/, "");
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

  if (!url || !serviceRoleKey) {
    const error = new Error("Supabase vector store is not configured.");
    error.statusCode = 503;
    error.code = "supabase_not_configured";
    throw error;
  }

  return { url, serviceRoleKey };
}

function getHeaders(extra = {}) {
  const { serviceRoleKey } = getSupabaseConfig();
  return {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    "Content-Type": "application/json",
    ...extra
  };
}

function getRestUrl(path) {
  const { url } = getSupabaseConfig();
  return `${url}/rest/v1/${path}`;
}

function encodeFilter(value) {
  return encodeURIComponent(String(value || ""));
}

function formatVector(embedding) {
  return `[${(embedding || []).map((value) => Number(value) || 0).join(",")}]`;
}

async function request(path, options = {}) {
  const url = getRestUrl(path);
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout

  try {
    const response = await fetch(url, {
      ...options,
      headers: getHeaders(options.headers),
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    let data = null;
    try {
      const text = await response.text();
      data = text ? JSON.parse(text) : null;
    } catch (parseError) {
      const error = new Error(`Failed to parse Supabase response: ${parseError.message}`);
      error.statusCode = 502;
      error.supabaseStatus = response.status;
      error.supabasePath = path;
      error.originalError = parseError;
      console.error(`[Supabase Parse Error] on ${path}:`, parseError.message);
      throw error;
    }

    if (!response.ok) {
      const error = new Error(data?.message || `Supabase vector request failed with ${response.status}`);
      error.statusCode = response.status;
      error.supabaseStatus = response.status;
      error.supabaseData = data;
      error.supabasePath = path;
      console.error(`[Supabase Error] ${response.status} on ${path}:`, data);
      throw error;
    }

    return data;
  } catch (error) {
    clearTimeout(timeoutId);
    
    if (error.name === 'AbortError') {
      const timeoutError = new Error('Supabase request timeout (10s)');
      timeoutError.statusCode = 504;
      timeoutError.code = 'supabase_timeout';
      console.error('[Supabase Timeout]', path);
      throw timeoutError;
    }

    // If error already has statusCode (from above), rethrow as-is
    if (error.statusCode) {
      throw error;
    }

    // For any other error (network, etc.), set a default status code
    if (!error.statusCode) {
      error.statusCode = 503;
      error.supabaseStatus = 503;
      error.supabasePath = path;
    }
    
    console.error('[Supabase Request Error]', path, error.message);
    throw error;
  }
}

function toDocumentRow(document) {
  return {
    document_id: document.documentId,
    brand_id: document.brandId,
    title: document.title || "",
    source_name: document.sourceName || "",
    stored_file_name: document.storedFileName || "",
    mime_type: document.mimeType || "",
    extension: document.extension || "",
    size_bytes: document.sizeBytes || 0,
    uploaded_at: document.uploadedAt,
    chunk_count: document.chunkCount || 0,
    extraction: document.extraction || {}
  };
}

function fromDocumentRow(row) {
  return {
    brandId: row.brand_id,
    documentId: row.document_id,
    title: row.title,
    sourceName: row.source_name,
    storedFileName: row.stored_file_name,
    mimeType: row.mime_type,
    extension: row.extension,
    sizeBytes: row.size_bytes,
    uploadedAt: row.uploaded_at,
    chunkCount: row.chunk_count,
    extraction: row.extraction || {}
  };
}

function getChunkSourceId(chunk) {
  return chunk.metadata?.source_id || chunk.metadata?.sourceId || chunk.documentId;
}

function getChunkSourceType(chunk) {
  return chunk.metadata?.source_type || chunk.metadata?.sourceType || "document";
}

function toChunkRow(chunk) {
  const metadata = { ...(chunk.metadata || {}), embedding_model: 'local-feature-hash-v1', retrieval_mode: 'lexical' };
  const embedding = formatVector(chunk.embedding);

  return {
    id: chunk.id,
    brand_id: chunk.brandId,
    document_id: chunk.documentId || null,
    source_id: getChunkSourceId(chunk),
    source_type: getChunkSourceType(chunk),
    text: chunk.text,
    metadata,
    // Preserve both existing vector columns for schema compatibility only.
    // New rows carry local feature hashes; live retrieval uses stored text.
    // Do not use the legacy semantic RPC over this mixed-model corpus.
    embedding,
    embedding_v3: embedding
  };
}

function fromChunkRow(row) {
  return {
    id: row.id,
    brandId: row.brand_id,
    documentId: row.document_id,
    text: row.text,
    metadata: row.metadata || {},
    embedding: row.embedding,
    score: row.score == null ? undefined : Number(row.score)
  };
}

async function upsertDocument({ document, chunks }) {
  const documentRow = toDocumentRow(document);
  const chunkRows = chunks.map(toChunkRow);
  let persistenceStarted = false;

  try {
    // Document IDs are unique per upload. Write the chunks before the
    // dashboard-visible document row so a failed chunk insert cannot leave a
    // ghost document with no retrievable content.
    await request(
      `knowledge_chunks?brand_id=eq.${encodeFilter(document.brandId)}&document_id=eq.${encodeFilter(document.documentId)}`,
      {
        method: "DELETE"
      }
    );
    persistenceStarted = true;

    if (chunkRows.length) {
      await request("knowledge_chunks", {
        method: "POST",
        body: JSON.stringify(chunkRows)
      });
    }

    await request("knowledge_documents?on_conflict=document_id", {
      method: "POST",
      headers: {
        Prefer: "resolution=merge-duplicates"
      },
      body: JSON.stringify([documentRow])
    });

    return {
      document,
      chunkCount: chunks.length
    };
  } catch (error) {
    if (persistenceStarted) {
      try {
        await deleteDocumentRecords({
          brandId: document.brandId,
          documentId: document.documentId
        });
      } catch (cleanupError) {
        error.cleanupError = cleanupError;
        console.error(
          `[knowledge] Database rollback failed for ${document.brandId}:${document.documentId}:`,
          cleanupError.message
        );
      }
    }

    throw error;
  }
}

async function upsertSourceChunks({ brandId, sourceId, sourceType, chunks }) {
  await deleteChunksBySource({ brandId, sourceId, sourceType });

  const chunkRows = chunks.map(toChunkRow);
  if (chunkRows.length) {
    await request("knowledge_chunks", {
      method: "POST",
      body: JSON.stringify(chunkRows)
    });
  }

  return {
    brandId,
    sourceId,
    sourceType,
    chunkCount: chunks.length
  };
}

async function listDocuments(brandId) {
  const rows = await request(
    `knowledge_documents?brand_id=eq.${encodeFilter(brandId)}&select=*&order=uploaded_at.desc`
  );

  return (Array.isArray(rows) ? rows : []).map(fromDocumentRow);
}

async function listDocumentChunks({ brandId, documentId }) {
  const rows = await request(`knowledge_chunks?brand_id=eq.${encodeFilter(brandId)}&document_id=eq.${encodeFilter(documentId)}&select=text,metadata&limit=500`);
  return (rows || []).sort((a, b) => Number(a.metadata?.chunkIndex || 0) - Number(b.metadata?.chunkIndex || 0));
}


async function deleteDocumentRecords({ brandId, documentId }) {
  const encodedBrandId = encodeFilter(brandId);
  const encodedDocumentId = encodeFilter(documentId);
  const [chunksResult, documentsResult] = await Promise.allSettled([
    request(
      `knowledge_chunks?brand_id=eq.${encodedBrandId}&document_id=eq.${encodedDocumentId}`,
      {
        method: "DELETE",
        headers: {
          Prefer: "return=representation"
        }
      }
    ),
    request(
      `knowledge_documents?brand_id=eq.${encodedBrandId}&document_id=eq.${encodedDocumentId}`,
      {
        method: "DELETE",
        headers: {
          Prefer: "return=representation"
        }
      }
    )
  ]);

  const failures = [chunksResult, documentsResult]
    .filter((result) => result.status === "rejected")
    .map((result) => result.reason);

  if (failures.length) {
    const error = new Error(
      `Knowledge document cleanup failed: ${failures.map((failure) => failure.message).join("; ")}`
    );
    error.statusCode = failures[0]?.statusCode || 503;
    error.code = "knowledge_document_cleanup_failed";
    error.causes = failures;
    throw error;
  }

  return {
    deleted:
      Array.isArray(documentsResult.value) &&
      documentsResult.value.length > 0,
    deletedChunks: Array.isArray(chunksResult.value)
      ? chunksResult.value.length
      : 0
  };
}

async function deleteDocument({ brandId, documentId }) {
  return deleteDocumentRecords({ brandId, documentId });
}

async function deleteChunksBySource({ brandId, sourceId, sourceType }) {
  const deletedChunks = await request(
    [
      `knowledge_chunks?brand_id=eq.${encodeFilter(brandId)}`,
      `source_id=eq.${encodeFilter(sourceId)}`,
      `source_type=eq.${encodeFilter(sourceType)}`
    ].join("&"),
    {
      method: "DELETE",
      headers: {
        Prefer: "return=representation"
      }
    }
  );

  return {
    deleted: Array.isArray(deletedChunks) && deletedChunks.length > 0,
    deletedChunks: Array.isArray(deletedChunks) ? deletedChunks.length : 0
  };
}

async function search({ brandId, queryEmbedding, topK = 5, minScore = 0.12 }) {
  throw new Error('Legacy semantic vector search is disabled; use brand-scoped text search.');
}

async function getStats(brandId) {
  // Scoped to source_type=document only — knowledge_chunks also holds FAQ/
  // policy chunks (structuredKnowledge.service.js writes those into the same
  // table with source_type "faq"/"policy"). Counting all of them here made
  // the Documents tab show "0 documents, 23 chunks" whenever a brand had
  // FAQs/policies but no uploaded files — a confusing, seemingly-broken
  // stat for anyone reading it as "chunks belonging to these 0 documents".
  const [documents, chunks] = await Promise.all([
    request(`knowledge_documents?brand_id=eq.${encodeFilter(brandId)}&select=document_id`),
    request(`knowledge_chunks?brand_id=eq.${encodeFilter(brandId)}&source_type=eq.document&select=id`)
  ]);

  return {
    brandId,
    documentCount: Array.isArray(documents) ? documents.length : 0,
    chunkCount: Array.isArray(chunks) ? chunks.length : 0
  };
}

async function searchText({ brandId, query, topK = 5 }) {
  if (!/^[a-z0-9-]+$/.test(String(brandId || ''))) throw new Error('A valid brandId is required for text search');
  const { rankChunks } = require('./localTextSearch');
  const chunks = [];
  const pageSize = 500;
  // Brand-scoped bounded pagination; fail rather than silently search only
  // part of a large corpus. Embeddings and other brands are not requested.
  for (let page = 0; page < 20; page += 1) {
    const rows = await request(`knowledge_chunks?brand_id=eq.${encodeFilter(brandId)}&select=id,brand_id,document_id,text,metadata&order=id.asc&limit=${pageSize}&offset=${page * pageSize}`);
    if (!Array.isArray(rows)) throw new Error('Invalid knowledge text-search response');
    if (rows.some(row => row.brand_id !== brandId)) throw new Error('Knowledge search returned an unexpected brand');
    chunks.push(...rows.map(fromChunkRow));
    if (rows.length < pageSize) return rankChunks(chunks, query, Math.min(50, Math.max(1, Number(topK) || 5)));
  }
  throw new Error('Knowledge text-search corpus exceeds the safe scan limit');
}

module.exports = {
  vectorStorePath,
  upsertDocument,
  upsertSourceChunks,
  listDocuments,
  listDocumentChunks,
  deleteDocument,
  deleteDocumentRecords,
  deleteChunksBySource,
  search,
  searchText,
  getStats
};
