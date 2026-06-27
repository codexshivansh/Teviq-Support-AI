const fs = require("fs");
const path = require("path");
const { cosineSimilarity } = require("./embedding.service");

const knowledgeDataDir = path.join(__dirname, "..", "data", "knowledge");
const vectorStorePath = path.join(knowledgeDataDir, "vector-store.json");

function ensureStore() {
  fs.mkdirSync(knowledgeDataDir, { recursive: true });
  if (!fs.existsSync(vectorStorePath)) {
    fs.writeFileSync(
      vectorStorePath,
      JSON.stringify({ version: 1, documents: [], chunks: [] }, null, 2) + "\n"
    );
  }
}

function readStore() {
  ensureStore();
  try {
    return JSON.parse(fs.readFileSync(vectorStorePath, "utf8"));
  } catch (error) {
    console.warn("[knowledge] Failed to read vector store:", error.message);
    return { version: 1, documents: [], chunks: [] };
  }
}

function writeStore(store) {
  ensureStore();
  fs.writeFileSync(vectorStorePath, JSON.stringify(store, null, 2) + "\n");
}

function upsertDocument({ document, chunks }) {
  const store = readStore();
  const remainingDocuments = store.documents.filter(
    (item) => !(item.brandId === document.brandId && item.documentId === document.documentId)
  );
  const remainingChunks = store.chunks.filter(
    (item) => !(item.brandId === document.brandId && item.documentId === document.documentId)
  );

  store.documents = [...remainingDocuments, document];
  store.chunks = [...remainingChunks, ...chunks];
  writeStore(store);

  return {
    document,
    chunkCount: chunks.length
  };
}

function listDocuments(brandId) {
  const store = readStore();
  return store.documents
    .filter((document) => document.brandId === brandId)
    .sort((left, right) => String(right.uploadedAt).localeCompare(String(left.uploadedAt)));
}

function deleteDocument({ brandId, documentId }) {
  const store = readStore();
  const beforeDocuments = store.documents.length;
  const beforeChunks = store.chunks.length;

  store.documents = store.documents.filter(
    (document) => !(document.brandId === brandId && document.documentId === documentId)
  );
  store.chunks = store.chunks.filter(
    (chunk) => !(chunk.brandId === brandId && chunk.documentId === documentId)
  );
  writeStore(store);

  return {
    deleted: beforeDocuments !== store.documents.length,
    deletedChunks: beforeChunks - store.chunks.length
  };
}

function search({ brandId, queryEmbedding, topK = 5, minScore = 0.12 }) {
  const store = readStore();

  return store.chunks
    .filter((chunk) => chunk.brandId === brandId)
    .map((chunk) => ({
      ...chunk,
      score: cosineSimilarity(queryEmbedding, chunk.embedding)
    }))
    .filter((chunk) => chunk.score >= minScore)
    .sort((left, right) => right.score - left.score)
    .slice(0, topK);
}

function getStats(brandId) {
  const store = readStore();
  const documents = store.documents.filter((document) => document.brandId === brandId);
  const chunks = store.chunks.filter((chunk) => chunk.brandId === brandId);

  return {
    brandId,
    documentCount: documents.length,
    chunkCount: chunks.length
  };
}

module.exports = {
  vectorStorePath,
  upsertDocument,
  listDocuments,
  deleteDocument,
  search,
  getStats
};
