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

// Widget quick-action buttons send their short label text as the chat
// message verbatim (e.g. "Setup time"), not a full sentence — so they
// rarely appear as a literal substring of the matching FAQ's full question
// ("How long does setup take?"), even though a human would obviously read
// them as the same thing. Without this, those clicks fall through to the
// low-confidence fallback instead of the FAQ that was written specifically
// to answer them.
const FAQ_MATCH_STOPWORDS = new Set([
  "a", "an", "the", "is", "are", "am", "do", "does", "did", "can", "could",
  "will", "would", "should", "what", "when", "where", "how", "why", "who",
  "which", "long", "you", "your", "i", "my", "me", "to", "for", "of", "in",
  "on", "at", "and", "or", "about", "with", "this", "that",
  "kya", "hai", "hain", "ho", "hota", "hoti", "kaise", "karu", "karta",
  "karte", "karna", "ke", "ki", "ka", "se", "mein", "me", "aap", "aapka",
  "aapke", "kitna", "kitni"
]);

function significantWords(text) {
  return text.split(" ").filter((word) => word.length > 2 && !FAQ_MATCH_STOPWORDS.has(word));
}

function isExactFaqMatch(chunk, query) {
  if (getSourceType(chunk) !== "faq") return false;
  const question = normalizeSearchText(chunk.metadata?.question || "");
  const normalizedQuery = normalizeSearchText(query);
  if (!question || !normalizedQuery) return false;

  if (question.includes(normalizedQuery) || normalizedQuery.includes(question)) {
    return true;
  }

  const queryWords = significantWords(normalizedQuery);
  // Only for short, keyword-style queries (quick-action clicks) — free-text
  // questions stay on the stricter embedding-similarity path so this can't
  // quietly start over-trusting unrelated FAQs for longer messages.
  if (queryWords.length === 0 || queryWords.length > 4) return false;

  const questionWords = new Set(significantWords(question));
  return queryWords.some((word) => questionWords.has(word));
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

  // Chunks embed the full "Q: ...\nA: ..." text, so a long answer dilutes
  // cosine similarity even when the customer's message is an exact (or
  // near-exact) match for a known FAQ's question — the raw score can land
  // under MIN_CONFIDENCE despite this being the most confident kind of
  // match retrieval can produce. isExactFaqMatch is already trusted
  // elsewhere in this file to re-rank such matches to the top; extending
  // that same trust to the confidence gate keeps a verbatim FAQ-question
  // match from being blocked just because its answer happens to be long.
  const hasExactFaqMatch = matches.some((match) => isExactFaqMatch(match, query));

  return {
    brandId,
    query,
    confidence: Number(topScore.toFixed(4)),
    confidenceLabel: topScore >= HIGH_CONFIDENCE ? "high" : topScore >= MIN_CONFIDENCE ? "medium" : "low",
    lowConfidence: !hasExactFaqMatch && topScore < MIN_CONFIDENCE,
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
