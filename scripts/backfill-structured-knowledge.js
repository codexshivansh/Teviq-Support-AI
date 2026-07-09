require("dotenv").config();
const localData = require("../data/knowledge/structured-knowledge.json");

const ORPHAN_CHUNK_ID = "faq_1783500314910_c50108bb_chunk_1";

function getSupabaseConfig() {
  const url = String(process.env.SUPABASE_URL || "").replace(/\/$/, "");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing in backend/.env.");
  }
  return { url, key };
}

async function insertRow(row) {
  const { url, key } = getSupabaseConfig();
  const headers = {
    apikey: key,
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
    Prefer: "return=representation"
  };

  const response = await fetch(`${url}/rest/v1/structured_knowledge`, {
    method: "POST",
    headers,
    body: JSON.stringify(row)
  });

  const text = await response.text();
  const data = text ? JSON.parse(text) : null;

  if (!response.ok) {
    return { ok: false, status: response.status, error: data };
  }
  return { ok: true, status: response.status, data };
}

function toRow(item) {
  return {
    id: item.id,
    brand_id: item.brandId,
    type: item.type,
    source: item.source || "manual",
    question: item.question ?? null,
    answer: item.answer ?? null,
    policy_type: item.policyType ?? null,
    title: item.title ?? null,
    content: item.content ?? null,
    tags: item.tags || [],
    metadata: item.metadata || {},
    created_at: item.createdAt,
    updated_at: item.updatedAt
  };
}

async function fetchOrphanChunk() {
  const { url, key } = getSupabaseConfig();
  const headers = { apikey: key, Authorization: `Bearer ${key}` };
  const response = await fetch(
    `${url}/rest/v1/knowledge_chunks?id=eq.${encodeURIComponent(ORPHAN_CHUNK_ID)}&select=id,brand_id,source_id,text,created_at`,
    { headers }
  );
  const rows = await response.json();
  return rows[0] || null;
}

function parseQA(text) {
  const match = String(text || "").match(/^Q:\s*(.*?)\s*\nA:\s*([\s\S]*)$/);
  if (!match) return { question: null, answer: null };
  return { question: match[1].trim(), answer: match[2].trim() };
}

async function run() {
  console.log(`Backfilling ${localData.items.length} items from structured-knowledge.json`);
  console.log("=".repeat(70));

  const results = [];

  for (const item of localData.items) {
    const row = toRow(item);
    const result = await insertRow(row);
    results.push({ id: item.id, brandId: item.brandId, ...result });

    if (result.ok) {
      console.log(`  OK   [${result.status}] ${item.id} (${item.brandId})`);
    } else {
      console.log(`  FAIL [${result.status}] ${item.id} (${item.brandId}) - ${JSON.stringify(result.error)}`);
    }
  }

  console.log("\n--- Orphan chunk backfill (no structured-knowledge.json source record) ---");
  const orphanChunk = await fetchOrphanChunk();

  if (!orphanChunk) {
    console.log(`  Orphan chunk ${ORPHAN_CHUNK_ID} not found — skipping.`);
  } else {
    const { question, answer } = parseQA(orphanChunk.text);
    console.log(`  Parsed question: "${question}"`);
    console.log(`  Parsed answer: "${answer}"`);

    const orphanRow = {
      id: orphanChunk.source_id,
      brand_id: orphanChunk.brand_id,
      type: "faq",
      source: "backfilled",
      question,
      answer,
      policy_type: null,
      title: null,
      content: null,
      tags: [],
      metadata: {
        backfilledFrom: "knowledge_chunks",
        note: "Recovered from an orphaned chunk with no structured-knowledge.json source record."
      },
      created_at: orphanChunk.created_at,
      updated_at: orphanChunk.created_at
    };

    const result = await insertRow(orphanRow);
    results.push({ id: orphanRow.id, brandId: orphanRow.brand_id, ...result });

    if (result.ok) {
      console.log(`  OK   [${result.status}] ${orphanRow.id} (${orphanRow.brand_id}) [orphan-backfill, source="backfilled"]`);
    } else {
      console.log(`  FAIL [${result.status}] ${orphanRow.id} (${orphanRow.brand_id}) - ${JSON.stringify(result.error)}`);
    }
  }

  const successCount = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok);

  console.log("\n" + "=".repeat(70));
  console.log("SUMMARY");
  console.log(`Total attempted: ${results.length}`);
  console.log(`Successful: ${successCount}`);
  console.log(`Failed: ${failed.length}`);
  if (failed.length) {
    console.log("Failed IDs:", failed.map((f) => f.id));
  }
}

run().catch((error) => {
  console.error("\n[backfill-structured-knowledge] Failed:", error.message);
  process.exitCode = 1;
});
