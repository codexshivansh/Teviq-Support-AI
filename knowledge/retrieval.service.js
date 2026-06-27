const { embedText } = require("./embedding.service");
const vectorStore = require("./vectorStore.service");

const HIGH_CONFIDENCE = 0.34;
const MIN_CONFIDENCE = 0.16;

function buildCitations(chunks) {
  return chunks.map((chunk) => ({
    chunkId: chunk.id,
    documentId: chunk.documentId,
    sourceName: chunk.metadata?.sourceName,
    sectionTitle: chunk.metadata?.sectionTitle,
    score: Number(chunk.score.toFixed(4))
  }));
}

function buildContextText(chunks) {
  return chunks
    .map((chunk, index) => {
      const source = chunk.metadata?.sourceName || chunk.documentId;
      const section = chunk.metadata?.sectionTitle || "Document";
      return `[K${index + 1}] ${source} > ${section}\n${chunk.text}`;
    })
    .join("\n\n");
}

function retrieveKnowledge({ brandId, query, topK = 5 }) {
  const queryEmbedding = embedText(query);
  const matches = vectorStore.search({
    brandId,
    queryEmbedding,
    topK,
    minScore: MIN_CONFIDENCE
  });

  const topScore = matches[0]?.score || 0;

  return {
    brandId,
    query,
    confidence: Number(topScore.toFixed(4)),
    confidenceLabel: topScore >= HIGH_CONFIDENCE ? "high" : topScore >= MIN_CONFIDENCE ? "medium" : "low",
    lowConfidence: topScore < MIN_CONFIDENCE,
    matches,
    citations: buildCitations(matches),
    contextText: buildContextText(matches)
  };
}

function shouldBlockAIForLowConfidence({ intent, knowledgeResult }) {
  if (!knowledgeResult?.lowConfidence) return false;
  return ["unknown", "product_recommendation"].includes(intent);
}

function buildLowConfidenceReply(brand) {
  const contact = brand.managerContact || {};
  const supportLine = contact.whatsapp
    ? `You can also contact support at ${contact.whatsapp}.`
    : contact.email
      ? `You can also contact support at ${contact.email}.`
      : "You can also ask for human support.";

  return `I do not have confirmed brand information for this yet, so I do not want to guess. ${supportLine}`;
}

module.exports = {
  retrieveKnowledge,
  shouldBlockAIForLowConfidence,
  buildLowConfidenceReply
};
