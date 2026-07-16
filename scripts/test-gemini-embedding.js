require("dotenv").config();

const {
  MODEL,
  OUTPUT_DIMENSIONALITY,
  embedForStorage,
  embedForQuery,
  embedBatchForStorage,
  cosineSimilarity
} = require("../knowledge/embedding.service");

const SAMPLE_TEXT = process.argv[2] || "Cash on delivery available hai?";

async function run() {
  const startedAt = Date.now();
  const [documentVector, queryVector] = await Promise.all([
    embedForStorage(SAMPLE_TEXT),
    embedForQuery(SAMPLE_TEXT)
  ]);
  const batchVectors = await embedBatchForStorage([
    SAMPLE_TEXT,
    "Returns are accepted according to the configured brand policy."
  ]);

  const vectors = [documentVector, queryVector, ...batchVectors];
  const dimensionsValid = vectors.every((values) => values.length === OUTPUT_DIMENSIONALITY);

  if (!dimensionsValid) {
    throw new Error(`Expected every vector to have ${OUTPUT_DIMENSIONALITY} dimensions.`);
  }

  console.log(`[test-gemini-embedding] Model: ${MODEL}`);
  console.log(`[test-gemini-embedding] Dimension: ${OUTPUT_DIMENSIONALITY}`);
  console.log(`[test-gemini-embedding] Single document/query calls: OK`);
  console.log(`[test-gemini-embedding] Batch call (${batchVectors.length} vectors): OK`);
  console.log(
    `[test-gemini-embedding] Query/document cosine similarity: ${cosineSimilarity(
      documentVector,
      queryVector
    ).toFixed(4)}`
  );
  console.log(`[test-gemini-embedding] Completed in ${Date.now() - startedAt}ms`);
}

run().catch((error) => {
  console.error(`[test-gemini-embedding] Failed: ${error.message}`);
  process.exitCode = 1;
});
