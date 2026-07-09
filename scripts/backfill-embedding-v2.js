require("dotenv").config();
const { embedBatchForStorage } = require("../knowledge/embedding.service");

function getSupabaseConfig() {
  const url = String(process.env.SUPABASE_URL || "").replace(/\/$/, "");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing in backend/.env.");
  }
  return { url, key };
}

function formatVector(values) {
  return `[${values.join(",")}]`;
}

async function fetchAllRows() {
  const { url, key } = getSupabaseConfig();
  const headers = { apikey: key, Authorization: `Bearer ${key}` };

  const response = await fetch(`${url}/rest/v1/knowledge_chunks?select=id,brand_id,text&order=id`, { headers });
  if (!response.ok) {
    throw new Error(`Failed to fetch rows: HTTP ${response.status}`);
  }
  return response.json();
}

async function patchEmbeddingV2(id, values) {
  const { url, key } = getSupabaseConfig();
  const headers = {
    apikey: key,
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json"
  };

  const response = await fetch(`${url}/rest/v1/knowledge_chunks?id=eq.${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers,
    body: JSON.stringify({ embedding_v2: formatVector(values) })
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    return { ok: false, status: response.status, error: text };
  }

  return { ok: true, status: response.status };
}

async function run() {
  console.log("=== STEP 1: fetch all knowledge_chunks rows (id, brand_id, text) ===");
  const rows = await fetchAllRows();
  console.log(`Fetched ${rows.length} rows`);

  console.log("\n=== STEP 2: embedBatchForStorage (single batch call) ===");
  const startedAt = Date.now();
  const embeddings = await embedBatchForStorage(rows.map((row) => row.text));
  console.log(`Got ${embeddings.length} embeddings in ${Date.now() - startedAt}ms`);

  if (embeddings.length !== rows.length) {
    throw new Error(`Mismatch: ${rows.length} rows but ${embeddings.length} embeddings returned`);
  }

  console.log("\n=== STEP 3: sequential PATCH updates ===");
  const results = [];
  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i];
    const values = embeddings[i];
    const result = await patchEmbeddingV2(row.id, values);
    results.push({ id: row.id, brandId: row.brand_id, ...result });

    if (result.ok) {
      console.log(`  OK   [${result.status}] ${row.id} (${row.brand_id})`);
    } else {
      console.log(`  FAIL [${result.status}] ${row.id} (${row.brand_id}) - ${result.error}`);
    }
  }

  const successCount = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok);

  console.log("\n=== SUMMARY ===");
  console.log(`Total rows: ${rows.length}`);
  console.log(`Successful updates: ${successCount}`);
  console.log(`Failed updates: ${failed.length}`);
  if (failed.length) {
    console.log("Failed IDs:", failed.map((f) => f.id));
  }
}

run().catch((error) => {
  console.error("\n[backfill-embedding-v2] Failed:", error.message);
  process.exitCode = 1;
});
