const { ORDER_INTENTS } = require("./toolRouter");
const { getEscalationContact } = require("../services/escalation.service");
const { containsSourcePrecedenceClaim } = require("../services/policyConflict.service");
const { isTeviqSalesBrand } = require('../services/teviqSalesScope.service');

// Teviq's knowledge-answering path has no account mutation or live transfer tool.
// A policy allowing an action is never evidence that the action happened.
function hasUnsupportedActionClaim(reply) {
  return /\b(?:subscription|account|plan|cancellation|refund|payment|data|messages?)\s+(?:(?:has|have) been |is |are |was |were )?(?:successfully )?(?:cancelled|canceled|confirmed|processed|refunded|deleted|erased|activated)\b/i.test(reply) ||
    /\b(?:i|we)(?:'ve| have|’ve)?\s+(?:successfully )?(?:cancelled|canceled|deleted|erased|refunded|activated|transferred)\b/i.test(reply) ||
    /\b(?:i am|i'm|i’m|we are|we're|we’re)\s+(?:now )?(?:transferring|connecting) you\b/i.test(reply) ||
    /(?:cancel|delete|refund|activate)\s+(?:kar diya|ho gaya|kar di|ho gayi)/i.test(reply);
}

function stripInternalJson(reply) {
  return reply
    .replace(/```json[\s\S]*?```/gi, "")
    .replace(/\{[\s\S]*"(reply|intent|source|escalated)"[\s\S]*\}/gi, "")
    .trim();
}

function stripCustomerFacingMarkdown(reply) {
  return String(reply || "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/^\s*[-*]\s+/gm, "- ")
    .trim();
}

function trimToWordLimit(reply, maxWords = 80) {
  const words = reply.split(/\s+/).filter(Boolean);
  if (words.length <= maxWords) return reply;

  const candidate = words.slice(0, maxWords).join(" ");
  const completeSentence = candidate.match(/^([\s\S]*[.!?])(?:\s|$)/);
  if (completeSentence && completeSentence[1].split(/\s+/).length >= 12) {
    return completeSentence[1].trim();
  }

  return `${candidate}...`;
}

function looksLikeIncompleteAiReply(reply, source) {
  const text = String(reply || "").trim();
  if (source === "system" || text.split(/\s+/).length <= 5 || /[.!?)]$/.test(text)) {
    return false;
  }

  return /\b(?:a|an|the|and|or|but|to|for|with|of|in|on|at|from|who|that|which|is|are|was|were|can|could|would|should|want|wants|need|needs)$/i.test(text);
}

function hasManagerContact(reply, brand) {
  const contact = getEscalationContact(brand);
  return Boolean(
    (contact.whatsapp && reply.includes(contact.whatsapp)) ||
      (contact.email && reply.includes(contact.email))
  );
}

function validateResponse({ reply, context, source, escalated }) {
  const warnings = [];
  let finalReply = stripCustomerFacingMarkdown(stripInternalJson(reply || ""));
  let shouldEscalate = escalated;

  if (!finalReply) {
    warnings.push("empty_reply_replaced");
    finalReply = "Sorry, I could not prepare a response. Please try again.";
  }

  if (looksLikeIncompleteAiReply(finalReply, source)) {
    warnings.push("incomplete_ai_reply_replaced");
    finalReply = "Sorry, I could not complete that response. Please try again.";
  }

  if (source !== 'system' && isTeviqSalesBrand(context.brand?.brandId) && hasUnsupportedActionClaim(finalReply)) {
    warnings.push('unsupported_account_action_removed');
    finalReply = 'I cannot perform or confirm account changes, refunds, data deletion, or a live agent transfer in this chat. Please contact Teviq support to request the action and obtain confirmation.';
    shouldEscalate = true;
  }

  if (
    context.policyConflict?.isConflict &&
    !context.policyConflict.configured &&
    containsSourcePrecedenceClaim(finalReply)
  ) {
    warnings.push("unsupported_policy_precedence_removed");
    finalReply = context.policyConflict.safeReply;
    shouldEscalate = true;
  }

  if (shouldEscalate) {
    if (!hasManagerContact(finalReply, context.brand)) {
      warnings.push("manager_contact_added");
      const contact = getEscalationContact(context.brand);
      finalReply = [finalReply, contact.whatsapp && `WhatsApp: ${contact.whatsapp}`, contact.email && `Email: ${contact.email}`]
        .filter(Boolean)
        .join(" ");
    }

    return {
      valid: warnings.length === 0,
      finalReply: trimToWordLimit(finalReply),
      warnings,
      forceEscalation: !escalated
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
    warnings,
    forceEscalation: false
  };
}

module.exports = { validateResponse };
