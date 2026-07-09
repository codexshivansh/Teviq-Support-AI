require("dotenv").config();

const { embedForQuery, cosineSimilarity } = require("../knowledge/embedding.service");

const DEFAULT_BRAND_ID = "vastra-demo";
const DEFAULT_QUERY = "How do I choose the right size?";

function getArgs() {
  const brandId = process.argv[2] || DEFAULT_BRAND_ID;
  const testQuery = process.argv.slice(3).join(" ") || DEFAULT_QUERY;
  return { brandId, testQuery };
}

function getSupabaseConfig() {
  const url = String(process.env.SUPABASE_URL || "").replace(/\/$/, "");
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

  if (!url || !serviceRoleKey) {
    throw new Error(
      "SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing in backend/.env. Add them (from Render/Supabase project settings) before running this script."
    );
  }

  return { url, serviceRoleKey };
}

function getHeaders() {
  const { serviceRoleKey } = getSupabaseConfig();
  return {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    "Content-Type": "application/json"
  };
}

function formatVector(embedding) {
  return `[${(embedding || []).map((value) => Number(value) || 0).join(",")}]`;
}

function parseVector(value) {
  if (Array.isArray(value)) return value.map(Number);
  if (typeof value === "string") {
    return value
      .replace(/^\[/, "")
      .replace(/\]$/, "")
      .split(",")
      .filter((part) => part.trim().length)
      .map(Number);
  }
  return [];
}

async function fetchChunksDirect(brandId) {
  const { url } = getSupabaseConfig();
  const path = `knowledge_chunks?brand_id=eq.${encodeURIComponent(brandId)}&select=id,brand_id,source_type,text,embedding`;

  const response = await fetch(`${url}/rest/v1/${path}`, {
    method: "GET",
    headers: getHeaders()
  });

  const text = await response.text();
  const data = text ? JSON.parse(text) : null;

  if (!response.ok) {
    throw new Error(`Direct table select failed (${response.status}): ${data?.message || text}`);
  }

  return Array.isArray(data) ? data : [];
}

async function callMatchRpc({ brandId, queryEmbedding, minScore = 0, matchCount = 20 }) {
  const { url } = getSupabaseConfig();

  const response = await fetch(`${url}/rest/v1/rpc/match_knowledge_chunks`, {
    method: "POST",
    headers: getHeaders(),
    body: JSON.stringify({
      p_brand_id: brandId,
      p_query_embedding: formatVector(queryEmbedding),
      p_min_score: minScore,
      p_match_count: matchCount
    })
  });

  const text = await response.text();
  const data = text ? JSON.parse(text) : null;

  if (!response.ok) {
    throw new Error(`match_knowledge_chunks RPC failed (${response.status}): ${data?.message || text}`);
  }

  return Array.isArray(data) ? data : [];
}

async function run() {
  const { brandId, testQuery } = getArgs();

  console.log("=".repeat(70));
  console.log("DEBUG RETRIEVAL");
  console.log("brandId:", brandId);
  console.log("testQuery:", testQuery);
  console.log("=".repeat(70));

  const queryEmbedding = await embedForQuery(testQuery);
  console.log(`\nQuery embedding dimensions: ${queryEmbedding.length}`);
  console.log("Query embedding first 10 values:", queryEmbedding.slice(0, 10));

  console.log("\n--- STEP 1: Direct table select (knowledge_chunks, no RPC) ---");
  const rows = await fetchChunksDirect(brandId);
  console.log(`Fetched ${rows.length} row(s) for brand_id=eq.${brandId}`);

  const manualResults = rows.map((row) => {
    const storedEmbedding = parseVector(row.embedding);
    const score = cosineSimilarity(queryEmbedding, storedEmbedding);
    const brandMatch = row.brand_id === brandId;

    return {
      id: row.id,
      brand_id: row.brand_id,
      brandMatch,
      source_type: row.source_type,
      textPreview: String(row.text || "").slice(0, 50),
      score
    };
  });

  console.log("\n--- STEP 2: Per-row manual cosine similarity ---");
  manualResults.forEach((result) => {
    console.log(
      `id=${result.id} | brand_id=${result.brand_id} | brandMatch=${result.brandMatch} | source_type=${result.source_type} | score=${result.score.toFixed(4)} | text="${result.textPreview}"`
    );
  });

  console.log("\n--- STEP 3: match_knowledge_chunks RPC (same brandId + embedding) ---");
  const rpcResults = await callMatchRpc({ brandId, queryEmbedding, minScore: 0, matchCount: 20 });
  console.log(`RPC returned ${rpcResults.length} row(s)`);
  rpcResults.forEach((row) => {
    console.log(
      `id=${row.id} | brand_id=${row.brand_id} | source_type=${row.source_type} | score=${Number(row.score).toFixed(4)} | text="${String(row.text || "").slice(0, 50)}"`
    );
  });

  console.log("\n--- STEP 4: Manual vs RPC comparison (by chunk id) ---");
  const rpcById = new Map(rpcResults.map((row) => [row.id, row]));
  manualResults.forEach((result) => {
    const rpcRow = rpcById.get(result.id);
    const rpcScore = rpcRow ? Number(rpcRow.score) : null;
    const diff = rpcScore == null ? "N/A (missing from RPC result)" : (result.score - rpcScore).toFixed(6);
    console.log(`id=${result.id} | manualScore=${result.score.toFixed(4)} | rpcScore=${rpcScore == null ? "N/A" : rpcScore.toFixed(4)} | diff=${diff}`);
  });

  console.log("\n--- STEP 5: TOP 5 by manual score ---");
  const top5 = [...manualResults].sort((a, b) => b.score - a.score).slice(0, 5);
  top5.forEach((result, index) => {
    console.log(
      `#${index + 1} id=${result.id} | score=${result.score.toFixed(4)} | source_type=${result.source_type} | text="${result.textPreview}"`
    );
  });

  console.log("\nDone.");
}

run().catch((error) => {
  console.error("\n[debug-retrieval] Failed:", error.message);
  process.exit(1);
});
