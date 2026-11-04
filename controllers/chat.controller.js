const { processMessage } = require("../brain/supportBrain");
const { getBrandById } = require("../services/brand.service");
const { resolveWidgetSession } = require("../services/widgetSession.service");
const { getConversationHandoff } = require('../services/conversationHandoff.service');
const { appendChatLog } = require('../services/analytics.service');
const { redactContactInfo } = require('../services/privacy.service');

function normalizeMessage(message) {
  return typeof message === "string" ? message.trim() : "";
}

function normalizeBrandId(value) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

async function handleChat(req, res, next) {
  const startedAt = Date.now();
  let phase = 'validate';
  const durations = {};
  let phaseStartedAt = startedAt;
  const mark = (nextPhase) => {
    durations[phase] = Date.now() - phaseStartedAt;
    phase = nextPhase;
    phaseStartedAt = Date.now();
  };
  try {
    const { sessionToken, message, context } = req.body || {};
    const brandId = normalizeBrandId(req.body?.brand_id || req.body?.brandId);
    const cleanMessage = normalizeMessage(message);

    if (!brandId) {
      return res.status(400).json({
        reply: "Brand is not configured for this widget.",
        source: "system",
        escalated: false,
        intent: "unknown",
        language: "english",
        sentiment: "neutral",
        warnings: ["missing_brand_id"]
      });
    }

    mark('brand');
    const brand = /^[a-z0-9-]+$/.test(brandId) ? await getBrandById(brandId) : null;
    if (!brand || brand.isActive === false) {
      return res.status(403).json({
        reply: "This support widget is not configured for the requested brand.",
        source: "system",
        escalated: false,
        intent: "unknown",
        language: "english",
        sentiment: "neutral",
        warnings: ["brand_unavailable"]
      });
    }

    if (!cleanMessage) {
      return res.status(400).json({
        reply: "Please type a message so I can help you.",
        source: "system",
        escalated: false,
        intent: "unknown",
        language: "english",
        sentiment: "neutral",
        warnings: ["missing_message"]
      });
    }

    // Public callers cannot select another customer's stored conversation ID.
    const session = resolveWidgetSession(brandId, sessionToken);
    mark('handoff');
    const handoff = await getConversationHandoff({ brandId, channel: 'widget', customerId: session.customerId });
    if (handoff.paused) {
      const reply = 'AI replies are paused while the team handles this conversation. Please use the business’s support contact for a human response.';
      await appendChatLog({ brandId, customerId: session.customerId, channel: 'widget',
        message: redactContactInfo(cleanMessage), reply, detectedIntent: 'human_support', escalated: true,
        source: 'system', knowledgeCitations: [], knowledgeConfidence: 0, isFallback: true, responseTimeMs: null });
      return res.json({ sessionToken: session.token, reply, source: 'system', escalated: true, intent: 'human_support', warnings: [] });
    }
    mark('brain');
    const result = await processMessage({
      brandId,
      message: cleanMessage,
      customerId: session.customerId,
      channel: 'widget',
      context,
      requestIp: req.ip
    });

    return res.status(result.statusCode || 200).json({
      sessionToken: session.token,
      reply: result.reply,
      source: result.source,
      escalated: result.escalated,
      intent: result.intent,
      language: result.language,
      sentiment: result.sentiment,
      warnings: result.warnings || [],
      products: result.products || [],
      leadCaptured: result.leadCaptured || false
    });
  } catch (error) {
    next(error);
  } finally {
    durations[phase] = Date.now() - phaseStartedAt;
    // Operational durations only: never log customer text, IDs, tokens or errors.
    console.info('[chat-timing]', JSON.stringify({ totalMs: Date.now() - startedAt, phases: durations }));
  }
}

module.exports = { handleChat };
