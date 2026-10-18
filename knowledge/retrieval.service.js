const vectorStore = require('./vectorStore.service');

// Lexical coverage heuristics, not calibrated semantic probabilities.
const HIGH_CONFIDENCE = 0.80;
const MIN_CONFIDENCE = 0.68;

async function retrieveKnowledge({ brandId, query, topK = 5 }) {
  const count = Math.min(20, Math.max(1, Math.floor(Number(topK) || 5)));
  let matches;
  try {
    matches = await vectorStore.searchText({ brandId, query, topK: count });
  } catch {
    console.warn('[retrieval] Text search unavailable; no unverified knowledge will be used.');
    matches = [];
  }
  const topScore = matches.reduce((max, match) => Math.max(max, match.score || 0), 0);
  return {
    brandId, query,
    confidence: Number(topScore.toFixed(4)),
    confidenceLabel: topScore >= HIGH_CONFIDENCE ? 'high' : topScore >= MIN_CONFIDENCE ? 'medium' : 'low',
    lowConfidence: topScore < MIN_CONFIDENCE,
    retrievalMode: 'lexical',
    matches,
    citations: matches.map(chunk => ({
      chunkId: chunk.id, documentId: chunk.documentId,
      sourceId: chunk.metadata?.source_id || chunk.metadata?.sourceId || chunk.documentId,
      sourceType: chunk.metadata?.source_type || chunk.metadata?.sourceType || 'document',
      sourceName: chunk.metadata?.sourceName, sectionTitle: chunk.metadata?.sectionTitle,
      score: Number(chunk.score.toFixed(4))
    })),
    contextText: matches.map((chunk, index) => {
      const source = chunk.metadata?.sourceName || chunk.documentId;
      const section = chunk.metadata?.sectionTitle || chunk.metadata?.source_type || 'document';
      return `[K${index + 1}] ${source} > ${section}\n${chunk.text}`;
    }).join('\n\n')
  };
}

function shouldBlockAIForLowConfidence({ intent, knowledgeResult }) {
  if (!knowledgeResult?.lowConfidence) return false;
  return ['unknown', 'product_recommendation', 'size_help', 'payment_cod', 'shipping_policy'].includes(intent);
}

function buildLowConfidenceReply(brand) {
  const contact = brand.managerContact || {};
  const supportLine = contact.whatsapp
    ? `You can also contact support at ${contact.whatsapp}.`
    : contact.email ? `You can also contact support at ${contact.email}.` : 'You can also ask for human support.';
  return `I do not have confirmed brand information for this yet, so I do not want to guess. ${supportLine}`;
}

module.exports = { retrieveKnowledge, shouldBlockAIForLowConfidence, buildLowConfidenceReply };
