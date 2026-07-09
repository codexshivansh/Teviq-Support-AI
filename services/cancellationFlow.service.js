const { isConfirmMessage, isDeclineMessage } = require("./confirmationDetector.service");

// Best-effort mapping from the customer's free-text reason to Shopify's
// OrderCancelReason enum (CUSTOMER, DECLINED, FRAUD, INVENTORY, STAFF,
// OTHER). This is a simple keyword match, not a claim of precise intent
// classification — "OTHER" is the safe default when nothing matches.
const REASON_KEYWORD_MAP = [
  { pattern: /\b(nahi chahiye|mann nahi|do not want|don't want|not needed|no longer need|mind badal)\b/i, code: "CUSTOMER" },
  { pattern: /\b(galti se|by mistake|wrong order|accidentally|galat order)\b/i, code: "CUSTOMER" },
  { pattern: /\b(late|deri|time zyada|too long|slow delivery)\b/i, code: "CUSTOMER" },
  { pattern: /\b(fraud|scam|unauthorized)\b/i, code: "FRAUD" },
  { pattern: /\b(stock nahi|out of stock|inventory)\b/i, code: "INVENTORY" },
  { pattern: /\b(payment|card declined|payment fail)\b/i, code: "DECLINED" }
];

function mapReasonToShopifyEnum(reasonText) {
  const match = REASON_KEYWORD_MAP.find((item) => item.pattern.test(String(reasonText || "")));
  return match ? match.code : "OTHER";
}

function buildCancellationReasonPrompt() {
  return "Aapka order Processing mein hai, cancel ho sakta hai. Kripya batayein — cancel karne ki wajah kya hai?";
}

function buildCancellationConfirmationPrompt(reason) {
  return `Samajh gaya — cancellation ki wajah: "${reason}". Kya main yeh order cancel kar doon? Reply "haan" ya "nahi".`;
}

// Pure decision function, same shape as returnFlow.service.js's
// handleReturnFlowMessage — no I/O, supportBrain.js does the actual state
// writes / Shopify call / return_requests row based on the returned action.
function handleCancellationFlowMessage({ context, message }) {
  const step = context?.step;

  if (step === "awaiting_reason") {
    const reason = String(message || "").trim();
    return {
      action: "ask_confirmation",
      nextContext: {
        ...context,
        reason,
        reasonCode: mapReasonToShopifyEnum(reason),
        step: "awaiting_confirmation"
      },
      reply: buildCancellationConfirmationPrompt(reason)
    };
  }

  if (step === "awaiting_confirmation") {
    const confirmed = isConfirmMessage(message);
    const declined = isDeclineMessage(message);

    if (confirmed && !declined) {
      return { action: "confirmed", nextContext: context, reply: null };
    }

    if (declined && !confirmed) {
      return {
        action: "declined",
        nextContext: {},
        reply: "Theek hai, maine order cancel nahi kiya. Aapka order abhi bhi Processing mein hai. Kisi aur cheez mein madad chahiye to bataiye."
      };
    }

    return {
      action: "ambiguous",
      nextContext: context,
      reply: 'Maaf kijiye, samajh nahi aaya. Kya aap order cancel karna chahte hain? Reply "haan" ya "nahi".'
    };
  }

  return {
    action: "reset",
    nextContext: {},
    reply: "Kuch gadbad ho gayi, chaliye dobara shuru karte hain. Aap kya poochna chahte hain?"
  };
}

module.exports = {
  buildCancellationReasonPrompt,
  buildCancellationConfirmationPrompt,
  mapReasonToShopifyEnum,
  handleCancellationFlowMessage
};
