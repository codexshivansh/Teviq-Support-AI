const { embedForQuery } = require("./embedding.service");
const vectorStore = require("./vectorStore.service");

const HIGH_CONFIDENCE = 0.80;
const MIN_CONFIDENCE = 0.74;

const SOURCE_PRIORITY = {
  faq: 0,
  policy: 1,
  document: 2
};

function getSourceType(chunk) {
  return chunk.metadata?.source_type || chunk.metadata?.sourceType || "document";
}

function normalizeSearchText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isExactFaqMatch(chunk, query) {
  if (getSourceType(chunk) !== "faq") return false;
  const question = normalizeSearchText(chunk.metadata?.question || "");
  const normalizedQuery = normalizeSearchText(query);
  if (!question || !normalizedQuery) return false;

  return question.includes(normalizedQuery) || normalizedQuery.includes(question);
}

function getPriorityScore(chunk, query) {
  const sourceType = getSourceType(chunk);
  const priority = SOURCE_PRIORITY[sourceType] ?? SOURCE_PRIORITY.document;
  const exactMatchBoost = isExactFaqMatch(chunk, query) ? 1 : 0;

  return {
    priority,
    exactMatchBoost,
    score: chunk.score || 0
  };
}

function sortByKnowledgePriority(query) {
  return (left, right) => {
    const leftRank = getPriorityScore(left, query);
    const rightRank = getPriorityScore(right, query);

    if (leftRank.priority !== rightRank.priority) {
      return leftRank.priority - rightRank.priority;
    }

    if (leftRank.exactMatchBoost !== rightRank.exactMatchBoost) {
      return rightRank.exactMatchBoost - leftRank.exactMatchBoost;
    }

    return rightRank.score - leftRank.score;
  };
}

function buildCitations(chunks) {
  return chunks.map((chunk) => ({
    chunkId: chunk.id,
    documentId: chunk.documentId,
    sourceId: chunk.metadata?.source_id || chunk.metadata?.sourceId || chunk.documentId,
    sourceType: getSourceType(chunk),
    sourceName: chunk.metadata?.sourceName,
    sectionTitle: chunk.metadata?.sectionTitle,
    score: Number(chunk.score.toFixed(4))
  }));
}

function buildContextText(chunks) {
  return chunks
    .map((chunk, index) => {
      const source = chunk.metadata?.sourceName || chunk.documentId;
      const sourceType = getSourceType(chunk);
      const section = chunk.metadata?.sectionTitle || sourceType;
      return `[K${index + 1}] ${source} > ${section}\n${chunk.text}`;
    })
    .join("\n\n");
}

async function retrieveKnowledge({ brandId, query, topK = 5 }) {
  let queryEmbedding;
  try {
    queryEmbedding = await embedForQuery(query);
  } catch (error) {
    console.error(`[retrieval] embedForQuery failed for brand "${brandId}": ${error.message}`);
    return {
      brandId,
      query,
      confidence: 0,
      confidenceLabel: "low",
      lowConfidence: true,
      matches: [],
      citations: [],
      contextText: ""
    };
  }

  console.log("[RETRIEVAL] Calling RPC for brand:", brandId, "query:", query);
  const matches = (await vectorStore.search({
    brandId,
    queryEmbedding,
    topK: Math.max(topK * 4, 20),
    minScore: 0.0
  })).sort(sortByKnowledgePriority(query)).slice(0, topK);
  console.log("[RETRIEVAL] RPC results:", matches?.length, matches);

  const topScore = matches.reduce((max, match) => Math.max(max, match.score || 0), 0);

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
  return ["unknown", "product_recommendation", "size_help", "payment_cod", "shipping_policy"].includes(intent);
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
