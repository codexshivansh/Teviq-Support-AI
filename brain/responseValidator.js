const { ORDER_INTENTS } = require("./toolRouter");

function stripInternalJson(reply) {
  return reply
    .replace(/```json[\s\S]*?```/gi, "")
    .replace(/\{[\s\S]*"(reply|intent|source|escalated)"[\s\S]*\}/gi, "")
    .trim();
}

function trimToWordLimit(reply, maxWords = 80) {
  const words = reply.split(/\s+/).filter(Boolean);
  if (words.length <= maxWords) return reply;
  return `${words.slice(0, maxWords).join(" ")}...`;
}

function hasManagerContact(reply, brand) {
  const contact = brand.managerContact || {};
  return Boolean(
    (contact.whatsapp && reply.includes(contact.whatsapp)) ||
      (contact.email && reply.includes(contact.email))
  );
}

function validateResponse({ reply, context, source, escalated }) {
  const warnings = [];
  let finalReply = stripInternalJson(reply || "");

  if (!finalReply) {
    warnings.push("empty_reply_replaced");
    finalReply = "Sorry, I could not prepare a response. Please try again.";
  }

  if (escalated) {
    if (!hasManagerContact(finalReply, context.brand)) {
      warnings.push("manager_contact_added");
      const contact = context.brand.managerContact || {};
      finalReply = [finalReply, contact.whatsapp && `WhatsApp: ${contact.whatsapp}`, contact.email && `Email: ${contact.email}`]
        .filter(Boolean)
        .join(" ");
    }

    return {
      valid: warnings.length === 0,
      finalReply: trimToWordLimit(finalReply),
      warnings
    };
  }

  if (context.order && !finalReply.includes(context.order.status)) {
    warnings.push("order_status_not_mentioned");
  }

  if (/refund (is|will be|has been|confirmed|approved)/i.test(finalReply) && !context.policyResult?.allowed) {
    warnings.push("refund_promise_removed");
    finalReply = context.policyResult?.reply || "Refunds depend on policy checks and team approval. I cannot confirm a refund yet.";
  }

  if (
    ORDER_INTENTS.includes(context.intent) &&
    !context.entities.orderId &&
    !/order id|order number|order no/i.test(finalReply)
  ) {
    warnings.push("missing_order_id_prompt_added");
    finalReply = "Please share your order ID so I can check this for you.";
  }

  finalReply = trimToWordLimit(finalReply);

  return {
    valid: warnings.length === 0,
    finalReply,
    warnings
  };
}

module.exports = { validateResponse };
