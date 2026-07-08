const { getBrandById } = require("../services/brand.service");
const { generateSupportReply } = require("../services/ai.service");
const { getConversationMemory, addConversationMessage } = require("../services/memory.service");
const { appendChatLog } = require("../services/analytics.service");
const { analyzeConversation } = require("./conversationAnalyzer");
const { detectIntent } = require("./intentEngine");
const { extractEntities } = require("./entityExtractor");
const { buildContext } = require("./contextBuilder");
const { routeTools } = require("./toolRouter");
const { validateResponse } = require("./responseValidator");
const {
  retrieveKnowledge,
  shouldBlockAIForLowConfidence,
  buildLowConfidenceReply
} = require("../knowledge/retrieval.service");

async function processMessage({ brandId, message, customerId = "guest" }) {
  const brand = await getBrandById(brandId);
  if (!brand) {
    return {
      statusCode: 404,
      reply: "This support widget is not configured for the requested brand.",
      source: "system",
      escalated: false,
      intent: "unknown",
      language: "english",
      sentiment: "neutral",
      warnings: ["brand_not_found"]
    };
  }

  const analysis = analyzeConversation(message);
  let intent = detectIntent(message);
  if (analysis.messageType === "complaint" && intent === "unknown") {
    intent = "complaint";
  }

  const entities = extractEntities(message);
  addConversationMessage(brandId, customerId, "user", message);
  const memory = getConversationMemory(brandId, customerId);

  const toolResult = routeTools({ brand, intent, entities, message });
  console.log("[BRAIN] Starting retrieval for brand:", brandId);
  const knowledge = toolResult.allowAI
    ? await retrieveKnowledge({ brandId: brand.brandId, query: message, topK: 5 })
    : null;
  console.log("[BRAIN] Retrieved chunks:", knowledge?.matches?.length || 0);
  const context = buildContext({
    brand,
    message,
    customerId,
    analysis,
    intent,
    entities,
    memory,
    order: toolResult.order,
    policyResult: toolResult.policyResult,
    leadState: toolResult.leadState,
    knowledge
  });

  let reply = toolResult.reply;
  let source = toolResult.source || "system";

  if (toolResult.allowAI && shouldBlockAIForLowConfidence({ intent, knowledgeResult: knowledge })) {
    reply = buildLowConfidenceReply(brand);
    source = "system";
  } else if (toolResult.allowAI) {
    const aiResponse = await generateSupportReply({
      brand,
      faqs: brand.faqs || [],
      message,
      customerId,
      intent,
      language: analysis.language,
      memory,
      knowledge
    });
    reply = aiResponse.reply;
    source = aiResponse.source;
  }

  const validation = validateResponse({
    reply,
    context,
    source,
    escalated: toolResult.escalated
  });

  addConversationMessage(brandId, customerId, "assistant", validation.finalReply);

  appendChatLog({
    brandId,
    customerId,
    message,
    detectedIntent: intent,
    escalated: toolResult.escalated,
    source,
    reply: validation.finalReply,
    knowledgeCitations: knowledge?.citations || [],
    knowledgeConfidence: knowledge?.confidence || 0
  });

  return {
    reply: validation.finalReply,
    source,
    escalated: toolResult.escalated,
    intent,
    language: analysis.language,
    sentiment: analysis.sentiment,
    warnings: validation.warnings
  };
}

module.exports = { processMessage };
