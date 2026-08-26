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
  },
  // Sales/objection-handling intents (salesObjection.service.js), routed via
  // toolRouter.js. Deliberately placed last/lowest-priority so an existing
  // support intent always wins a post-purchase query first (e.g. "kab tak
  // aayega mera order" still hits order_tracking above, never
  // delivery_objection here) — per the requirement that these only fire
  // for genuine pre-purchase doubts.
  //
  // NOTE: several of the keyword lists below overlap with earlier support
  // intents that already exist in this array — "discount"/"offer" are
  // already claimed by discount_query (line ~59), "cod"/"cash on delivery"
  // by payment_cod (line ~55), "delivery time"/"deliver" by shipping_policy
  // (line ~47), and "size"/"fit"/"size guide" by size_help (line ~51).
  // Because .find() above stops at the first match, those specific phrases
  // will keep resolving to the existing intent, not the new objection one —
  // the new rules below only ever fire on the phrasing that isn't already
  // claimed (e.g. "mehenga", "genuine hai", "kab tak aayega", "COD hai kya",
  // "size kaisa"). Flagged for the brand owner to confirm this is
  // acceptable, since it means price_objection/cod_objection/etc. are
  // effectively narrower in practice than their listed keyword sets imply.
  {
    intent: "price_objection",
    patterns: [
      /\b(mehenga|sasta|discount|offer|price kam|expensive|cheaper|bahut zyada)\b/i
    ]
  },
  {
    intent: "trust_objection",
    patterns: [
      /\b(genuine hai|asli hai|fake to nahi|trust|reviews|authentic|real hai)\b/i
    ]
  },
  {
    intent: "delivery_objection",
    patterns: [
      /\b(kab tak aayega|delivery time|kitne din|jaldi chahiye|fast delivery)\b/i
    ]
  },
  {
    intent: "cod_objection",
    patterns: [
      /\b(cod hai kya|cash on delivery|cod available|pay on delivery|pehle dekhke pay)\b/i
    ]
  },
  {
    intent: "size_fit_objection",
    patterns: [
      /\b(size kaisa|fit aayega|size guide|loose|tight|xl milega|size chart|size return)\b/i
    ]
  },
  // B2B objection-handling intents (b2bObjection.service.js), routed via
  // toolRouter.js. Appended after the D2C objection intents above, so
  // still lowest-priority overall — a D2C support/objection intent always
  // wins first if a message happens to match both sets.
  //
  // NOTE: "partnership" (listed for b2b_agency_objection) is already
  // claimed by business_enquiry (line ~19, first rule in this array), so a
  // message containing only that word resolves to business_enquiry, not
  // b2b_agency_objection — same overlap pattern as the D2C block above.
  // Flagged for the brand owner to confirm that's acceptable.
  {
    intent: "b2b_roi_objection",
    patterns: [
      /\b(roi|return on investment|kya fayda|prove karo|results dikhao|does it work)\b/i
    ]
  },
  {
    intent: "b2b_build_objection",
    patterns: [
      /\b(hum bana lenge|in-house|apna system|build karenge|team hai hamare)\b/i
    ]
  },
  {
    intent: "b2b_integration_objection",
    patterns: [
      /\b(integration|setup kitna|complicated hai|dev team chahiye|technical effort)\b/i
    ]
  },
  {
    intent: "b2b_trial_objection",
    patterns: [
      /\b(trial chahiye|pehle test|pilot|demo pehle|free try)\b/i
    ]
  },
  {
    intent: "b2b_budget_objection",
    patterns: [
      /\b(budget nahi|abhi nahi|baad mein|costly hai agency ke liye|not in budget)\b/i
    ]
  },
  {
    intent: "b2b_agency_objection",
    patterns: [
      /\b(agency hoon|clients ke liye|reseller|white label|margin kya|partnership)\b/i
    ]
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
