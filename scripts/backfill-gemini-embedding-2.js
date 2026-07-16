require("dotenv").config();
const { embedBatchForStorage, MODEL } = require("../knowledge/embedding.service");

function getSupabaseConfig() {
  const url = String(process.env.SUPABASE_URL || "").replace(/\/$/, "");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
  return { url, key };
}

function getHeaders(extra = {}) {
  const { key } = getSupabaseConfig();
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
    ...extra
  };
}

function formatVector(values) {
  return `[${values.join(",")}]`;
}

async function fetchChunks() {
  const { url } = getSupabaseConfig();
  const response = await fetch(
    `${url}/rest/v1/knowledge_chunks?select=id,brand_id,text&order=id&limit=1000`,
    { headers: getHeaders() }
  );
  if (!response.ok) throw new Error(`Knowledge chunk fetch failed with HTTP ${response.status}.`);
  return response.json();
}

async function patchChunk(id, embedding) {
  const { url } = getSupabaseConfig();
  const response = await fetch(`${url}/rest/v1/knowledge_chunks?id=eq.${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: getHeaders(),
    body: JSON.stringify({ embedding_v3: formatVector(embedding) })
  });
  if (!response.ok) throw new Error(`Embedding update failed for ${id} with HTTP ${response.status}.`);
}

async function run() {
  if (MODEL !== "gemini-embedding-2") {
    throw new Error(`Backfill requires GEMINI_EMBEDDING_MODEL=gemini-embedding-2; received ${MODEL}.`);
  }

  const chunks = await fetchChunks();
  console.log(`Embedding ${chunks.length} knowledge chunks with ${MODEL}...`);
  const embeddings = await embedBatchForStorage(chunks.map((chunk) => chunk.text));

  for (let index = 0; index < chunks.length; index += 1) {
    await patchChunk(chunks[index].id, embeddings[index]);
  }

  console.log(`Backfilled ${chunks.length} knowledge chunks.`);
}

run().catch((error) => {
  console.error(`[embedding-backfill] ${error.message}`);
  process.exitCode = 1;
});
