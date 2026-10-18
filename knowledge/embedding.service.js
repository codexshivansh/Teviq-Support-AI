const { tokenize } = require('./localTextSearch');

// Local feature hashes keep uploads compatible with the NOT NULL vector(768)
// schema. Retrieval uses text, not these or historical Gemini vectors. These
// are lexical features, not semantic embeddings; no provider call is made.
const MODEL = 'local-feature-hash-v1';
const OUTPUT_DIMENSIONALITY = 768;

function localFeatures(text) {
  const values = Array(OUTPUT_DIMENSIONALITY).fill(0);
  for (const token of tokenize(text)) {
    let hash = 2166136261;
    for (const character of token) hash = Math.imul(hash ^ character.codePointAt(0), 16777619) >>> 0;
    values[hash % OUTPUT_DIMENSIONALITY] += 1;
  }
  const magnitude = Math.hypot(...values);
  return magnitude ? values.map(value => value / magnitude) : values;
}

async function embedForStorage(text) { return localFeatures(text); }
async function embedForQuery(text) { return localFeatures(text); }
async function embedBatchForStorage(texts) { return texts.map(localFeatures); }

function cosineSimilarity(left, right) {
  if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) return 0;
  let dot = 0, magLeft = 0, magRight = 0;
  for (let i = 0; i < left.length; i += 1) {
    dot += left[i] * right[i]; magLeft += left[i] ** 2; magRight += right[i] ** 2;
  }
  const magnitude = Math.sqrt(magLeft * magRight);
  return magnitude ? dot / magnitude : 0;
}

module.exports = { MODEL, OUTPUT_DIMENSIONALITY, embedForStorage, embedForQuery, embedBatchForStorage, cosineSimilarity };
