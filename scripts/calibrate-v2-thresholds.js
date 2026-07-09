require("dotenv").config();
const { embedForQuery } = require("../knowledge/embedding.service");

function getSupabaseConfig() {
  const url = String(process.env.SUPABASE_URL || "").replace(/\/$/, "");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing in backend/.env.");
  }
  return { url, key };
}

const GENUINE_CASES = [
  { query: "Cash on delivery available hai?", brandId: "vastra-demo" },
  { query: "Cash on delivery available hai?", brandId: "urban-demo" },
  { query: "Cash on delivery available hai?", brandId: "beauty-demo" },
  { query: "Sahi size kaise choose karu?", brandId: "vastra-demo" },
  { query: "Mujhe nahi pata kaunsa size lena chahiye", brandId: "vastra-demo" },
  { query: "Delivery mein kitna time lagta hai?", brandId: "vastra-demo" },
  { query: "Delivery mein kitna time lagta hai?", brandId: "urban-demo" },
  { query: "Delivery mein kitna time lagta hai?", brandId: "beauty-demo" },
  { query: "Warranty kitni milti hai?", brandId: "urban-demo" },
  { query: "Ingredients allergy info kaha milegi?", brandId: "beauty-demo" },
  { query: "Order cancel kaise karu?", brandId: "vastra-demo" },
  { query: "Order cancel kaise karu?", brandId: "urban-demo" },
  { query: "Order cancel kaise karu?", brandId: "beauty-demo" }
];

const FALSE_CASES = [
  { query: "Aapke paas laptop bags milte hain?", brandId: "vastra-demo" },
  { query: "Kya aap makeup products bhi bechte ho?", brandId: "urban-demo" },
  { query: "Mujhe formal shoes chahiye", brandId: "beauty-demo" },
  { query: "Aaj mausam kaisa hai?", brandId: "vastra-demo" },
  { query: "Aaj mausam kaisa hai?", brandId: "urban-demo" },
  { query: "Aaj mausam kaisa hai?", brandId: "beauty-demo" },
  { query: "Modi ji kaise hain?", brandId: "vastra-demo" },
  { query: "Modi ji kaise hain?", brandId: "urban-demo" },
  { query: "Modi ji kaise hain?", brandId: "beauty-demo" }
];

async function getTopMatch(brandId, queryEmbedding) {
  const { url, key } = getSupabaseConfig();
  const headers = { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" };

  const response = await fetch(`${url}/rest/v1/rpc/match_knowledge_chunks_v2`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      p_brand_id: brandId,
      p_query_embedding: `[${queryEmbedding.join(",")}]`,
      p_min_score: 0.0,
      p_match_count: 1
    })
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`RPC failed HTTP ${response.status}: ${text}`);
  }

  const rows = await response.json();
  return rows[0] || null;
}

async function runCases(cases, label) {
  console.log(`\n--- ${label} ---`);
  const results = [];

  for (const testCase of cases) {
    const queryEmbedding = await embedForQuery(testCase.query);
    const top = await getTopMatch(testCase.brandId, queryEmbedding);
    const score = top ? Number(top.score) : 0;
    const textPreview = top ? String(top.text).replace(/\n/g, " ").slice(0, 55) : "(no match)";

    console.log(
      `score=${score.toFixed(4)} | brand=${testCase.brandId.padEnd(12)} | query="${testCase.query}" | top="${textPreview}"`
    );

    results.push({ ...testCase, score, topText: textPreview });
  }

  return results;
}

function stats(results) {
  const scores = results.map((r) => r.score);
  return {
    min: Math.min(...scores),
    max: Math.max(...scores),
    avg: scores.reduce((sum, s) => sum + s, 0) / scores.length
  };
}

async function run() {
  console.log("Calibration data collection against match_knowledge_chunks_v2 (Gemini 768-dim embeddings)");
  console.log("=".repeat(90));

  const genuineResults = await runCases(GENUINE_CASES, "GENUINE MATCHES (expect high score)");
  const falseResults = await runCases(FALSE_CASES, "FALSE MATCHES (expect low score, unrelated)");

  const genuineStats = stats(genuineResults);
  const falseStats = stats(falseResults);
  const gap = genuineStats.min - falseStats.max;

  console.log("\n" + "=".repeat(90));
  console.log("SUMMARY");
  console.log("=".repeat(90));
  console.log(`Genuine matches (n=${genuineResults.length}): min=${genuineStats.min.toFixed(4)}, max=${genuineStats.max.toFixed(4)}, avg=${genuineStats.avg.toFixed(4)}`);
  console.log(`False matches   (n=${falseResults.length}): min=${falseStats.min.toFixed(4)}, max=${falseStats.max.toFixed(4)}, avg=${falseStats.avg.toFixed(4)}`);
  console.log(`\nGap (lowest genuine - highest false): ${gap.toFixed(4)} ${gap > 0 ? "(separable)" : "(OVERLAPPING - no clean threshold exists)"}`);
}

run().catch((error) => {
  console.error("\n[calibrate-v2-thresholds] Failed:", error.message);
  process.exitCode = 1;
});
