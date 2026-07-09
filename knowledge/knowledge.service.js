const { extractText } = require("./extraction.service");
const { chunkText } = require("./chunking.service");
const { embedBatchForStorage } = require("./embedding.service");
const vectorStore = require("./vectorStore.service");

async function ingestKnowledgeDocument(uploadMetadata) {
  const extracted = await extractText(uploadMetadata);
  const chunks = chunkText(extracted.text, uploadMetadata);

  if (!chunks.length) {
    const error = new Error("No readable text was found in this document.");
    error.statusCode = 400;
    throw error;
  }

  const embeddingValues = await embedBatchForStorage(chunks.map((chunk) => chunk.text));
  const embeddedChunks = chunks.map((chunk, index) => ({ ...chunk, embedding: embeddingValues[index] }));
  const document = {
    brandId: uploadMetadata.brandId,
    documentId: uploadMetadata.documentId,
    title: uploadMetadata.title,
    sourceName: uploadMetadata.sourceName,
    storedFileName: uploadMetadata.storedFileName,
    mimeType: uploadMetadata.mimeType,
    extension: uploadMetadata.extension,
    sizeBytes: uploadMetadata.sizeBytes,
    uploadedAt: uploadMetadata.uploadedAt,
    chunkCount: embeddedChunks.length,
    extraction: {
      pages: extracted.pages || null,
      warnings: extracted.warnings || []
    }
  };

  return vectorStore.upsertDocument({
    document,
    chunks: embeddedChunks
  });
}

module.exports = { ingestKnowledgeDocument };
