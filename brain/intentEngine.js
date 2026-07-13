const { parseBudget, hasProductKeywordMatch } = require("../services/product.service");
const { extractOrderId } = require("./entityExtractor");

const TEVIQ_PRODUCT_QUESTION_PATTERNS = [
  /\bteviq\b/i,
  /\b(?:widget|knowledge base|uploaded (?:pdf|document|file)|multiple storefronts?)\b/i,
  /\b(?:ai response|ai answer|resolution rate|resolved response)\b/i,
  /\b(?:one brand|another brand|brand data|customer data)\b/i,
  /\b(?:contradictory|conflicting) (?:documents?|policies|rules|sources?)\b/i,
  /\b(?:manually add|training time|train (?:the )?ai|which source)\b/i
];

const POLICY_INFORMATION_PATTERN =
  /\b(?:return|exchange|refund|cancellation|shipping) (?:policy|rules?|process|window|conditions?|eligibility)\b/i;

const INTENT_RULES = [
  {
    intent: "business_enquiry",
    patterns: [/\b(bulk order|wholesale|b2b|collaboration|collab|partnership|business enquiry|business inquiry|influencer)\b/i]
  },
  {
    intent: "human_support",
    patterns: [/\b(human|agent|person|call me|contact me|talk to|speak to|manager|support team)\b/i]
  },
  {
    intent: "refund_status",
    patterns: [
      /\b(refund status|money back|credited|bank transfer|upi refund)\b/i,
      /\b(?:where is|when (?:will|do|did)|track)\b.{0,24}\b(?:my )?refund\b/i,
      /\brefund\b.{0,24}\b(?:pending|processed|received|credited|bank|upi|account)\b/i
    ]
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
    intent: "discount_query",
    patterns: [/\b(discount|coupon|promo|offer|sale|deal|code)\b/i]
  },
  {
    intent: "product_recommendation",
    patterns: [/\b(recommend|suggest|best|which one|what should i buy|gift|occasion|wedding|office|daily wear|routine)\b/i]
  },
  {
    intent: "subjective_opinion",
    patterns: [/\bworth/i, /\bsahi rahega\b/i, /\bachha hai kya\b/i]
  },
  {
    intent: "complaint",
    patterns: [
      /\b(complaint|complain|not satisfied|bad experience|terrible|worst)\b/i,
      /\b(slapped|hit me|punched|kicked|assaulted|attacked|harassed|threatened|touched me|misbehaved with me)\b/i
    ]
  },
  {
    intent: "general_faq",
    patterns: [/\b(policy|faq|help|support|how do i|how to|available|hours|warranty|patch test)\b/i]
  }
];

function detectIntent(message, brandId) {
  if (
    brandId === "teviq" &&
    TEVIQ_PRODUCT_QUESTION_PATTERNS.some((pattern) => pattern.test(message))
  ) {
    return "general_faq";
  }

  if (
    POLICY_INFORMATION_PATTERN.test(message) &&
    !extractOrderId(message) &&
    !/\b(?:my|mera|meri) (?:order|item|return|exchange|refund|cancellation)\b/i.test(message)
  ) {
    return "general_faq";
  }

  const matchedRule = INTENT_RULES.find((rule) =>
    rule.patterns.some((pattern) => pattern.test(message))
  );

  if (matchedRule) return matchedRule.intent;

  // No explicit keyword fired (e.g. no "recommend"/"suggest"). If the
  // message names an actual product (title/handle/category/tags/keywords)
  // AND carries a budget, treat it as a product query anyway — this is
  // what lets "kurta 1500 ke andar" resolve without needing filler words.
  // Requiring both signals together keeps this from misfiring on unrelated
  // messages that merely contain a number.
  if (brandId && parseBudget(message) != null && hasProductKeywordMatch(brandId, message)) {
    return "product_recommendation";
  }

  return "unknown";
}

module.exports = { detectIntent };
