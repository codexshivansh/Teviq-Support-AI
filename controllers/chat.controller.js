const { processMessage } = require("../brain/supportBrain");

function normalizeMessage(message) {
  return typeof message === "string" ? message.trim() : "";
}

async function handleChat(req, res, next) {
  try {
    const { brandId, customerId = "guest", message } = req.body || {};
    const cleanMessage = normalizeMessage(message);

    if (!brandId || typeof brandId !== "string") {
      return res.status(400).json({
        reply: "brandId is required.",
        source: "system",
        escalated: false,
        intent: "unknown",
        language: "english",
        sentiment: "neutral",
        warnings: ["missing_brand_id"]
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
