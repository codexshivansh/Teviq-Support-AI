const { getBrandById } = require("../services/brand.service");
const { generateSupportReply } = require("../services/ai.service");
const { getConversationMemory, addConversationMessage } = require("../services/memory.service");
const { getState, setState } = require("../services/conversationState.service");
const { detectEscalation, buildEscalationReply } = require("../services/escalation.service");
const { handleReturnFlowMessage, buildReturnReasonPrompt } = require("../services/returnFlow.service");
const { handleCancellationFlowMessage, buildCancellationReasonPrompt } = require("../services/cancellationFlow.service");
const { createReturnRequestRecord, findActiveRequest } = require("../services/returnRequestRecord.service");
const { getRecommendedProducts, buildProductRecommendationReply } = require("../services/product.service");
const { decryptValue } = require("../services/shopifyCredentials.service");
const { fetchFulfillmentLineItems, createReturnRequest: createShopifyReturnRequest } = require("../integrations/shopify/shopifyReturns.service");
const { cancelOrder } = require("../integrations/shopify/shopifyOrderCancel.service");
const { appendChatLog } = require("../services/analytics.service");
const { analyzeConversation } = require("./conversationAnalyzer");
const { detectIntent } = require("./intentEngine");
const { extractEntities } = require("./entityExtractor");
const { buildContext } = require("./contextBuilder");
const { routeTools, ORDER_INTENTS } = require("./toolRouter");
const { validateResponse } = require("./responseValidator");
const {
  retrieveKnowledge,
  shouldBlockAIForLowConfidence,
  buildLowConfidenceReply
} = require("../knowledge/retrieval.service");

const CONVERSATION_STATE_STALE_MS = 10 * 60 * 1000; // 10 minutes

function buildSimpleReplyResult({ reply, escalated, intent, analysis }) {
  return {
    reply,
    source: "system",
    escalated,
    intent,
    language: analysis.language,
    sentiment: analysis.sentiment,
    warnings: []
  };
}

// Handles a message that arrives while the customer is mid-return-flow
// (conversation_states.state === "checking_return"). Hard escalation always
// takes priority over the flow itself. Everything else is delegated to the
// pure decision function in returnFlow.service.js; this function is only
// responsible for the I/O (state writes, Shopify call, return_requests row).
async function handleCheckingReturnState({ brand, brandId, customerId, channel, message, context, analysis }) {
  const hardEscalation = detectEscalation(message, brand);
  if (hardEscalation.escalated) {
    try {
      await setState(brandId, customerId, channel, "idle", {});
    } catch (error) {
      console.error(`[BRAIN] Failed to reset conversation state after escalation for ${brandId}:${customerId}: ${error.message}`);
    }
    const escalationReply = buildEscalationReply(brand);
    addConversationMessage(brandId, customerId, "user", message);
    addConversationMessage(brandId, customerId, "assistant", escalationReply);
    appendChatLog({
      brandId,
      customerId,
      message,
      detectedIntent: "escalation",
      escalated: true,
      source: "system",
      reply: escalationReply,
      knowledgeCitations: [],
      knowledgeConfidence: 0
    });
    return buildSimpleReplyResult({ reply: escalationReply, escalated: true, intent: "escalation", analysis });
  }

  const flowResult = handleReturnFlowMessage({ context, message });
  let finalReply = flowResult.reply;

  if (flowResult.action === "ask_confirmation") {
    try {
      await setState(brandId, customerId, channel, "checking_return", flowResult.nextContext);
    } catch (error) {
      console.error(`[BRAIN] Failed to persist checking_return state for ${brandId}:${customerId}: ${error.message}`);
    }
  } else if (flowResult.action === "declined" || flowResult.action === "reset") {
    try {
      await setState(brandId, customerId, channel, "idle", {});
    } catch (error) {
      console.error(`[BRAIN] Failed to reset conversation state for ${brandId}:${customerId}: ${error.message}`);
    }
  } else if (flowResult.action === "ambiguous") {
    // Deliberately do not touch state — give the customer another chance to
    // answer the same question.
  } else if (flowResult.action === "confirmed") {
    const orderId = context?.orderId;
    const reason = context?.reason;
    let status = "pending";
    let shopifyReturnId = null;
    let shopifyError = null;

    if (brand.shopifyStoreUrl && brand.shopifyTokenEncrypted) {
      try {
        const accessToken = decryptValue(brand.shopifyTokenEncrypted);
        const { fulfillmentLineItems } = await fetchFulfillmentLineItems({
          storeHost: brand.shopifyStoreUrl,
          accessToken,
          orderId
        });
        const submission = await createShopifyReturnRequest({
          storeHost: brand.shopifyStoreUrl,
          accessToken,
          orderId,
          lineItems: fulfillmentLineItems.map((item) => ({
            fulfillmentLineItemId: item.fulfillmentLineItemId,
            quantity: item.quantity
          })),
          reasonDefinitionId: null,
          customerNote: reason
        });
        status = "shopify_submitted";
        shopifyReturnId = submission.shopifyReturnId;
      } catch (error) {
        console.error(`[BRAIN] Shopify return submission failed for ${brandId}/${orderId}: ${error.message}`);
        status = "shopify_failed";
        shopifyError = error.message;
      }
    } else {
      console.log(`[BRAIN] Shopify not connected for brand "${brandId}" — logging return request without submitting.`);
    }

    try {
      await createReturnRequestRecord({
        brandId,
        orderId,
        customerId,
        requestType: "return",
        customerNote: reason,
        status,
        shopifyReturnId,
        shopifyError
      });
    } catch (error) {
      console.error(`[BRAIN] Failed to save return_requests record for ${brandId}/${orderId}: ${error.message}`);
    }

    try {
      await setState(brandId, customerId, channel, "idle", {});
    } catch (error) {
      console.error(`[BRAIN] Failed to reset conversation state for ${brandId}:${customerId}: ${error.message}`);
    }

    finalReply =
      status === "shopify_submitted"
        ? "Aapki return request Shopify ko bhej di gayi hai. Team jald aapse contact karegi."
        : "Aapka return note kar liya gaya hai, hamari team jald aapse contact karegi.";
  }

  addConversationMessage(brandId, customerId, "user", message);
  addConversationMessage(brandId, customerId, "assistant", finalReply);
  appendChatLog({
    brandId,
    customerId,
    message,
    detectedIntent: "return_exchange",
    escalated: false,
    source: "system",
    reply: finalReply,
    knowledgeCitations: [],
    knowledgeConfidence: 0
  });

  return buildSimpleReplyResult({ reply: finalReply, escalated: false, intent: "return_exchange", analysis });
}

// Handles a message that arrives while the customer is mid-cancellation-flow
// (conversation_states.state === "checking_cancellation"). Mirrors
// handleCheckingReturnState's shape, with two differences: (1) Option B was
// chosen for F2 — the bot calls Shopify's orderCancel directly on confirm,
// there is no Shopify-side approval-gated equivalent to lean on the way
// returnRequest provided one; (2) an idempotency check runs first, since
// orderCancel has real, immediate side effects and must not fire twice for
// the same order.
async function handleCheckingCancellationState({ brand, brandId, customerId, channel, message, context, analysis }) {
  const hardEscalation = detectEscalation(message, brand);
  if (hardEscalation.escalated) {
    try {
      await setState(brandId, customerId, channel, "idle", {});
    } catch (error) {
      console.error(`[BRAIN] Failed to reset conversation state after escalation for ${brandId}:${customerId}: ${error.message}`);
    }
    const escalationReply = buildEscalationReply(brand);
    addConversationMessage(brandId, customerId, "user", message);
    addConversationMessage(brandId, customerId, "assistant", escalationReply);
    appendChatLog({
      brandId,
      customerId,
      message,
      detectedIntent: "escalation",
      escalated: true,
      source: "system",
      reply: escalationReply,
      knowledgeCitations: [],
      knowledgeConfidence: 0
    });
    return buildSimpleReplyResult({ reply: escalationReply, escalated: true, intent: "escalation", analysis });
  }

  const flowResult = handleCancellationFlowMessage({ context, message });
  let finalReply = flowResult.reply;

  if (flowResult.action === "ask_confirmation") {
    try {
      await setState(brandId, customerId, channel, "checking_cancellation", flowResult.nextContext);
    } catch (error) {
      console.error(`[BRAIN] Failed to persist checking_cancellation state for ${brandId}:${customerId}: ${error.message}`);
    }
  } else if (flowResult.action === "declined" || flowResult.action === "reset") {
    try {
      await setState(brandId, customerId, channel, "idle", {});
    } catch (error) {
      console.error(`[BRAIN] Failed to reset conversation state for ${brandId}:${customerId}: ${error.message}`);
    }
  } else if (flowResult.action === "ambiguous") {
    // Deliberately do not touch state — give the customer another chance to
    // answer the same question.
  } else if (flowResult.action === "confirmed") {
    const orderId = context?.orderId;
    const reason = context?.reason;
    const reasonCode = context?.reasonCode || "OTHER";

    let alreadyRequested = null;
    try {
      alreadyRequested = await findActiveRequest({ brandId, orderId, requestType: "cancellation" });
    } catch (error) {
      console.error(`[BRAIN] Idempotency check failed for cancellation ${brandId}/${orderId}: ${error.message}`);
    }

    if (alreadyRequested) {
      try {
        await setState(brandId, customerId, channel, "idle", {});
      } catch (error) {
        console.error(`[BRAIN] Failed to reset conversation state for ${brandId}:${customerId}: ${error.message}`);
      }
      finalReply = "Yeh order pehle se hi cancel process mein hai — dobara request karne ki zaroorat nahi hai. Team update ke saath jald contact karegi.";
    } else {
      let status = "pending";
      let shopifyJobId = null;
      let shopifyError = null;

      if (brand.shopifyStoreUrl && brand.shopifyTokenEncrypted) {
        try {
          const accessToken = decryptValue(brand.shopifyTokenEncrypted);
          const submission = await cancelOrder({
            storeHost: brand.shopifyStoreUrl,
            accessToken,
            orderId,
            reason: reasonCode,
            restock: true,
            notifyCustomer: true
          });
          status = "shopify_submitted";
          shopifyJobId = submission.shopifyJobId;
        } catch (error) {
          console.error(`[BRAIN] Shopify order cancellation failed for ${brandId}/${orderId}: ${error.message}`);
          status = "shopify_failed";
          shopifyError = error.message;
        }
      } else {
        console.log(`[BRAIN] Shopify not connected for brand "${brandId}" — logging cancellation request without submitting.`);
      }

      try {
        await createReturnRequestRecord({
          brandId,
          orderId,
          customerId,
          requestType: "cancellation",
          reasonCode,
          customerNote: reason,
          status,
          shopifyReturnId: shopifyJobId,
          shopifyError
        });
      } catch (error) {
        console.error(`[BRAIN] Failed to save cancellation return_requests record for ${brandId}/${orderId}: ${error.message}`);
      }

      try {
        await setState(brandId, customerId, channel, "idle", {});
      } catch (error) {
        console.error(`[BRAIN] Failed to reset conversation state for ${brandId}:${customerId}: ${error.message}`);
      }

      finalReply =
        status === "shopify_submitted"
          ? "Aapka order cancel kar diya gaya hai. Refund/confirmation details jald milengi."
          : "Aapka cancellation request note kar liya gaya hai, hamari team jald aapse contact karegi.";
    }
  }

  addConversationMessage(brandId, customerId, "user", message);
  addConversationMessage(brandId, customerId, "assistant", finalReply);
  appendChatLog({
    brandId,
    customerId,
    message,
    detectedIntent: "cancellation",
    escalated: false,
    source: "system",
    reply: finalReply,
    knowledgeCitations: [],
    knowledgeConfidence: 0
  });

  return buildSimpleReplyResult({ reply: finalReply, escalated: false, intent: "cancellation", analysis });
}

// Handles a message that arrives while the customer is mid-product-narrowing
// (conversation_states.state === "narrowing_products"). The follow-up
// message (typically a budget or category detail) is combined with the
// original query and re-scored together — this is what lets "kuch achha
// suggest karo" -> "2000 ke andar" resolve as one connected request instead
// of two unrelated turns. Unlike return/cancellation, there is no confirm
// step and no Shopify side effect, so this only ever needs one round-trip
// before resetting to idle (or staying put if still ambiguous).
async function handleNarrowingProductsState({ brand, brandId, customerId, channel, message, context, analysis }) {
  const hardEscalation = detectEscalation(message, brand);
  if (hardEscalation.escalated) {
    try {
      await setState(brandId, customerId, channel, "idle", {});
    } catch (error) {
      console.error(`[BRAIN] Failed to reset conversation state after escalation for ${brandId}:${customerId}: ${error.message}`);
    }
    const escalationReply = buildEscalationReply(brand);
    addConversationMessage(brandId, customerId, "user", message);
    addConversationMessage(brandId, customerId, "assistant", escalationReply);
    appendChatLog({
      brandId,
      customerId,
      message,
      detectedIntent: "escalation",
      escalated: true,
      source: "system",
      reply: escalationReply,
      knowledgeCitations: [],
      knowledgeConfidence: 0
    });
    return buildSimpleReplyResult({ reply: escalationReply, escalated: true, intent: "escalation", analysis });
  }

  const combinedQuery = `${context?.originalQuery || ""} ${message}`.trim();
  const products = getRecommendedProducts({ brandId: brand.brandId, message: combinedQuery });
  const recommendationReply = buildProductRecommendationReply({ brand, products, message: combinedQuery });

  let finalReply;
  if (recommendationReply) {
    finalReply = recommendationReply;
    try {
      await setState(brandId, customerId, channel, "idle", {});
    } catch (error) {
      console.error(`[BRAIN] Failed to reset conversation state for ${brandId}:${customerId}: ${error.message}`);
    }
  } else {
    // Still no keyword match and no budget — leave the state in place and
    // give the customer another chance to narrow it down.
    finalReply = "Maaf kijiye, samajh nahi aaya. Kripya category (jaise kurta, dress) ya budget bataiye taaki main sahi products suggest kar sakoon.";
  }

  addConversationMessage(brandId, customerId, "user", message);
  addConversationMessage(brandId, customerId, "assistant", finalReply);
  appendChatLog({
    brandId,
    customerId,
    message,
    detectedIntent: "product_recommendation",
    escalated: false,
    source: "system",
    reply: finalReply,
    knowledgeCitations: [],
    knowledgeConfidence: 0
  });

  return buildSimpleReplyResult({ reply: finalReply, escalated: false, intent: "product_recommendation", analysis });
}

async function processMessage({ brandId, message, customerId = "guest", channel = "widget" }) {
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
  let intent = detectIntent(message, brand.brandId);
  if (analysis.messageType === "complaint" && intent === "unknown") {
    intent = "complaint";
  }

  const entities = extractEntities(message);

  // Conversation-state resume: if this customer was just asked for their
  // order ID and this message supplies one, resume the intent that asked
  // for it instead of trusting a fresh classification of a bare order code
  // (which usually has no keyword for intentEngine.js to match and would
  // otherwise fall through to "unknown"). State reads/writes are best-effort
  // — a Supabase hiccup here should degrade to normal (stateless) behavior,
  // never break the chat request.
  let conversationState = { state: "idle", context: {}, updatedAt: null };
  try {
    conversationState = await getState(brandId, customerId, channel);
  } catch (error) {
    console.error(`[BRAIN] Failed to read conversation state for ${brandId}:${customerId}: ${error.message}`);
  }

  const isConversationStateFresh =
    Boolean(conversationState.updatedAt) &&
    Date.now() - new Date(conversationState.updatedAt).getTime() < CONVERSATION_STATE_STALE_MS;

  if (conversationState.state === "checking_return" && isConversationStateFresh) {
    return handleCheckingReturnState({
      brand,
      brandId,
      customerId,
      channel,
      message,
      context: conversationState.context,
      analysis
    });
  }

  if (conversationState.state === "checking_cancellation" && isConversationStateFresh) {
    return handleCheckingCancellationState({
      brand,
      brandId,
      customerId,
      channel,
      message,
      context: conversationState.context,
      analysis
    });
  }

  if (conversationState.state === "narrowing_products" && isConversationStateFresh) {
    return handleNarrowingProductsState({
      brand,
      brandId,
      customerId,
      channel,
      message,
      context: conversationState.context,
      analysis
    });
  }

  if (
    conversationState.state === "collecting_order_id" &&
    isConversationStateFresh &&
    entities.orderId &&
    conversationState.context?.pendingIntent
  ) {
    intent = conversationState.context.pendingIntent;
  }

  addConversationMessage(brandId, customerId, "user", message);
  const memory = getConversationMemory(brandId, customerId);

  const toolResult = routeTools({ brand, intent, entities, message });

  // Update conversation state based on this turn's outcome. If the order ID
  // was genuinely missing (not just invalid), remember which intent asked
  // for it so the next turn can resume correctly. If this turn resolved a
  // Delivered order for a return_exchange request, start the return-reason
  // flow instead of just resetting to idle — this is what lets "return
  // karna hai" (asked for order ID) -> "TVQ1001" (order resolves, eligible)
  // continue straight into "what's the reason" in one connected experience.
  // Once any other order is successfully found, reset to idle — there is no
  // further expected follow-up tied to a plain status lookup. If an order ID
  // was given but not found, deliberately do nothing: leave any existing
  // "collecting_order_id" state untouched so a corrected ID on the next turn
  // still resumes.
  try {
    if (ORDER_INTENTS.includes(intent) && !entities.orderId && toolResult.allowAI === false) {
      await setState(brandId, customerId, channel, "collecting_order_id", { pendingIntent: intent });
    } else if (intent === "return_exchange" && toolResult.order && toolResult.policyResult?.allowed) {
      await setState(brandId, customerId, channel, "checking_return", {
        orderId: toolResult.order.orderId,
        step: "awaiting_reason"
      });
      toolResult.reply = buildReturnReasonPrompt();
    } else if (intent === "cancellation" && toolResult.order && toolResult.policyResult?.allowed) {
      await setState(brandId, customerId, channel, "checking_cancellation", {
        orderId: toolResult.order.orderId,
        step: "awaiting_reason"
      });
      toolResult.reply = buildCancellationReasonPrompt();
    } else if (intent === "product_recommendation" && toolResult.needsProductNarrowing) {
      await setState(brandId, customerId, channel, "narrowing_products", {
        originalQuery: message,
        category: toolResult.detectedCategory || null
      });
    } else if (entities.orderId && toolResult.order) {
      await setState(brandId, customerId, channel, "idle", {});
    }
  } catch (error) {
    console.error(`[BRAIN] Failed to update conversation state for ${brandId}:${customerId}: ${error.message}`);
  }

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
    reply = toolResult.fallbackReply || buildLowConfidenceReply(brand);
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
