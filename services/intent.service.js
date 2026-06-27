const { detectEscalation } = require("./escalation.service");

const INTENT_RULES = [
  {
    intent: "lead_capture",
    patterns: [
      /\b(human|agent|person|call me|contact me|talk to|speak to|manager|support team)\b/i,
      /\b(complaint|complain|issue unresolved|not satisfied)\b/i,
      /\b(bulk order|wholesale|b2b|collaboration|collab|influencer|partnership|business enquiry|business inquiry)\b/i
    ]
  },
  {
    intent: "refund_status",
    patterns: [/\b(refund|money back|credited|bank transfer|upi refund|refund status)\b/i]
  },
  {
    intent: "return_exchange",
    patterns: [/\b(return|exchange|replace|replacement|wrong size|damaged|defective)\b/i]
  },
  {
    intent: "cancellation",
    patterns: [/\b(cancel|cancellation|stop my order|cancelled|canceled)\b/i]
  },
  {
    intent: "order_tracking",
    patterns: [/\b(order|track|tracking|shipment|shipped|delivery status|delivered|courier|awb|where is|status)\b/i]
  },
  {
    intent: "shipping_policy",
    patterns: [/\b(shipping|delivery time|deliver|dispatch|pincode|pin code|how many days|when will)\b/i]
  },
  {
    intent: "size_help",
    patterns: [/\b(size|fit|measurement|measurements|size chart|guide|small|medium|large|xl|xxl)\b/i]
  },
  {
    intent: "payment_cod",
    patterns: [/\b(cod|cash on delivery|payment|pay online|upi|card|wallet|net banking)\b/i]
  },
  {
    intent: "product_recommendation",
    patterns: [/\b(recommend|suggest|best|which one|what should i buy|gift|occasion|wedding|office|daily wear)\b/i]
  },
  {
    intent: "general_faq",
    patterns: [/\b(policy|faq|help|support|how do i|how to|available|hours)\b/i]
  }
];

function detectLanguage(message) {
  if (/[ऀ-ॿ]/.test(message)) {
    return "hinglish";
  }

  if (
    /\b(kya|hai|hain|kaise|kab|kitna|mera|meri|mujhe|chahiye|nahi|nahin|order kaha|paise|wapas)\b/i.test(
      message
    )
  ) {
    return "hinglish";
  }

  return "english";
}

function detectIntent(message) {
  if (detectEscalation(message).escalated) {
    return "escalation";
  }

  const matchedRule = INTENT_RULES.find((rule) =>
    rule.patterns.some((pattern) => pattern.test(message))
  );

  return matchedRule ? matchedRule.intent : "general_faq";
}

module.exports = { detectIntent, detectLanguage };
