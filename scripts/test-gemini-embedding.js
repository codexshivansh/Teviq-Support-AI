require("dotenv").config();

const MODEL = process.env.GEMINI_EMBEDDING_MODEL || "gemini-embedding-001";
const SAMPLE_TEXT = process.argv[2] || "Cash on delivery available hai?";

function cosineSimilarity(a, b) {
  if (a.length !== b.length) return null;
  let dot = 0;
  let magA = 0;
  let magB = 0;
  for (let i = 0; i < a.length; i += 1) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  return dot / (Math.sqrt(magA) * Math.sqrt(magB));
}

async function embed({ text, outputDimensionality, taskType }) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "GEMINI_API_KEY is not set in backend/.env. Add a real Gemini API key to run this test."
    );
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:embedContent?key=${apiKey}`;
  const body = {
    model: `models/${MODEL}`,
    content: { parts: [{ text }] }
  };

  if (outputDimensionality) body.output_dimensionality = outputDimensionality;
  if (taskType) body.task_type = taskType;

  const startedAt = Date.now();
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  const latencyMs = Date.now() - startedAt;

  const responseText = await response.text();
  const data = responseText ? JSON.parse(responseText) : null;

  if (!response.ok) {
    console.log("Raw error response:", JSON.stringify(data, null, 2));
    throw new Error(data?.error?.message || `Gemini embedding request failed with ${response.status}`);
  }

  const values = data?.embedding?.values || data?.embeddings?.[0]?.values;
  const responseShape = data?.embedding ? "embedding.values" : data?.embeddings ? "embeddings[0].values" : "unknown";

  if (!values) {
    console.log("Full raw response (could not find expected embedding values path):");
    console.log(JSON.stringify(data, null, 2));
    throw new Error("Could not locate embedding values in response.");
  }

  return { values, latencyMs, status: response.status, responseShape };
}

async function run() {
  console.log(`Model: ${MODEL}`);
  console.log(`Sample text: "${SAMPLE_TEXT}"`);
  console.log("=".repeat(70));

  console.log("\n--- TEST 1: baseline call (no output_dimensionality, no task_type) ---");
  const baseline = await embed({ text: SAMPLE_TEXT });
  console.log(`HTTP status: ${baseline.status}, latency: ${baseline.latencyMs}ms`);
  console.log(`Response shape used: ${baseline.responseShape}`);
  console.log(`Output dimension: ${baseline.values.length}`);
  console.log(`First 10 values: ${JSON.stringify(baseline.values.slice(0, 10))}`);

  console.log("\n--- TEST 2: output_dimensionality: 768 ---");
  const dim768 = await embed({ text: SAMPLE_TEXT, outputDimensionality: 768 });
  console.log(`HTTP status: ${dim768.status}, latency: ${dim768.latencyMs}ms`);
  console.log(`Output dimension: ${dim768.values.length}`);
  console.log(`Dimension matches requested 768: ${dim768.values.length === 768}`);
  console.log(`First 10 values: ${JSON.stringify(dim768.values.slice(0, 10))}`);

  console.log("\n--- TEST 3: task_type RETRIEVAL_DOCUMENT (output_dimensionality: 768) ---");
  const asDocument = await embed({ text: SAMPLE_TEXT, outputDimensionality: 768, taskType: "RETRIEVAL_DOCUMENT" });
  console.log(`HTTP status: ${asDocument.status}, latency: ${asDocument.latencyMs}ms`);
  console.log(`Output dimension: ${asDocument.values.length}`);
  console.log(`First 10 values: ${JSON.stringify(asDocument.values.slice(0, 10))}`);

  console.log("\n--- TEST 4: task_type RETRIEVAL_QUERY (output_dimensionality: 768) ---");
  const asQuery = await embed({ text: SAMPLE_TEXT, outputDimensionality: 768, taskType: "RETRIEVAL_QUERY" });
  console.log(`HTTP status: ${asQuery.status}, latency: ${asQuery.latencyMs}ms`);
  console.log(`Output dimension: ${asQuery.values.length}`);
  console.log(`First 10 values: ${JSON.stringify(asQuery.values.slice(0, 10))}`);

  const sameVectorCheck = JSON.stringify(asDocument.values) === JSON.stringify(asQuery.values);
  const similarity = cosineSimilarity(asDocument.values, asQuery.values);

  console.log("\n" + "=".repeat(70));
  console.log("SUMMARY");
  console.log("=".repeat(70));
  console.log(`Response field path: ${baseline.responseShape}`);
  console.log(`output_dimensionality:768 respected: ${dim768.values.length === 768}`);
  console.log(`RETRIEVAL_DOCUMENT vs RETRIEVAL_QUERY vectors identical: ${sameVectorCheck} (expected: false, asymmetric embeddings)`);
  console.log(`Cosine similarity between the two task_type vectors (same text): ${similarity.toFixed(4)}`);
  console.log(`Latencies (ms): baseline=${baseline.latencyMs}, dim768=${dim768.latencyMs}, retrieval_document=${asDocument.latencyMs}, retrieval_query=${asQuery.latencyMs}`);
  const avgLatency = (baseline.latencyMs + dim768.latencyMs + asDocument.latencyMs + asQuery.latencyMs) / 4;
  console.log(`Average latency: ${avgLatency.toFixed(0)}ms`);
}

run().catch((error) => {
  console.error("\n[test-gemini-embedding] Failed:", error.message);
  process.exitCode = 1;
});
