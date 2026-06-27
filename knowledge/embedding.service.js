const DIMENSIONS = 256;
const STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "by",
  "for",
  "from",
  "in",
  "is",
  "it",
  "of",
  "on",
  "or",
  "that",
  "the",
  "this",
  "to",
  "with",
  "you",
  "your"
]);

function tokenize(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 1 && !STOP_WORDS.has(token));
}

function hashToken(token) {
  let hash = 2166136261;
  for (let index = 0; index < token.length; index += 1) {
    hash ^= token.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function normalize(vector) {
  const magnitude = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
  if (!magnitude) return vector;
  return vector.map((value) => Number((value / magnitude).toFixed(6)));
}

function embedText(text) {
  const vector = new Array(DIMENSIONS).fill(0);
  const tokens = tokenize(text);

  tokens.forEach((token) => {
    const hash = hashToken(token);
    const index = hash % DIMENSIONS;
    const sign = hash % 2 === 0 ? 1 : -1;
    vector[index] += sign;
  });

  return normalize(vector);
}

function cosineSimilarity(left, right) {
  if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) {
    return 0;
  }

  return left.reduce((sum, value, index) => sum + value * right[index], 0);
}

function embedChunks(chunks) {
  return chunks.map((chunk) => ({
    ...chunk,
    embedding: embedText(chunk.text)
  }));
}

module.exports = {
  DIMENSIONS,
  tokenize,
  embedText,
  embedChunks,
  cosineSimilarity
};
