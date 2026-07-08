const { processMessage } = require("../brain/supportBrain");
const { getBrandById } = require("../services/brand.service");

function normalizeMessage(message) {
  return typeof message === "string" ? message.trim() : "";
}

function normalizeBrandId(value) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

async function handleChat(req, res, next) {
  try {
    const { customerId = "guest", message } = req.body || {};
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

    if (!/^[a-z0-9-]+$/.test(brandId) || !getBrandById(brandId)) {
      return res.status(403).json({
        reply: "This support widget is not configured for the requested brand.",
        source: "system",
        escalated: false,
        intent: "unknown",
        language: "english",
        sentiment: "neutral",
        warnings: ["invalid_brand_id"]
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

    const result = await processMessage({
      brandId,
      message: cleanMessage,
      customerId
    });

    return res.status(result.statusCode || 200).json({
      reply: result.reply,
      source: result.source,
      escalated: result.escalated,
      intent: result.intent,
      language: result.language,
      sentiment: result.sentiment,
      warnings: result.warnings || []
    });
  } catch (error) {
    next(error);
  }
}

module.exports = { handleChat };
