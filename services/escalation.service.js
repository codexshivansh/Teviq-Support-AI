const HARD_ESCALATION_PATTERNS = [
  {
    reason: "legal_action",
    pattern:
      /\b(?:legal action|consumer court|take (?:you|this) to court|sue (?:you|this)|contact(?:ing)? (?:a|my) lawyer|file|raise|lodge)\b.{0,24}\b(?:fir|police complaint|legal complaint|case)\b/i
  },
  {
    reason: "police_threat",
    pattern: /\b(?:call|contact|report(?:ing)?|go(?:ing)? to)\b.{0,20}\b(?:the )?police\b/i
  },
  {
    reason: "fraud_accusation",
    pattern:
      /\b(?:(?:this|it|you|your (?:brand|company|store)) (?:is|are) (?:a )?(?:fraud|scam|fake)|(?:you|your (?:brand|company|store)) (?:cheated|scammed|defrauded) (?:me|us))\b/i
  },
  {
    reason: "threat_or_self_harm",
    pattern: /\b(?:kill|suicide|self[- ]?harm|death threat|threaten(?:ing)? to hurt)\b/i
  },
  {
    reason: "physical_assault",
    pattern:
      /(?:\b(?:slapped|hit|punched|kicked|assaulted|attacked|physically hurt|harassed|threatened|touched) (?:me|us)\b|\b(?:i|we) (?:was|were) (?:slapped|hit|punched|kicked|assaulted|attacked|physically hurt|harassed|threatened|touched inappropriately)\b|\b(?:misbehaved|behaved inappropriately) with (?:me|us)\b)/i
  },
  {
    reason: "serious_abuse",
    pattern: /\b(?:bastard|fuck|asshole|madarchod|bhenchod)\b/i
  },
  {
    reason: "standalone_hard_keyword",
    pattern: /^\s*(?:fraud|scam|legal action|police complaint|fir)\s*[!.]*\s*$/i
  }
];

const CONTEXT_REQUIRED_BRAND_KEYWORDS = new Set([
  "fraud",
  "scam",
  "legal",
  "police",
  "fir",
  "fake",
  "cheat",
  "cheated"
]);

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function matchesBrandHardKeyword(message, keyword) {
  const cleanKeyword = String(keyword || "").trim();
  if (!cleanKeyword) return false;
  if (CONTEXT_REQUIRED_BRAND_KEYWORDS.has(cleanKeyword.toLowerCase())) return false;
  return new RegExp(`(?:^|\\b)${escapeRegExp(cleanKeyword)}(?:\\b|$)`, "i").test(message);
}

function detectEscalation(message, brand) {
  const text = String(message || "").trim();
  const brandKeywords = brand?.escalationRules?.hardKeywords || [];
  const matchedPattern = HARD_ESCALATION_PATTERNS.find(({ pattern }) => pattern.test(text));
  const matchedBrandKeyword = brandKeywords.find((keyword) => matchesBrandHardKeyword(text, keyword));

  return {
    escalated: Boolean(matchedPattern || matchedBrandKeyword),
    matchedKeyword: matchedBrandKeyword || matchedPattern?.reason || null
  };
}

function getEscalationContact(brand) {
  const configuredContact = brand?.managerContact || brand?.escalationContact || {};

  return {
    whatsapp:
      configuredContact.whatsapp ||
      brand?.escalationWhatsapp ||
      brand?.contact?.phone ||
      null,
    email: configuredContact.email || brand?.contact?.email || null,
    hours: configuredContact.hours || brand?.businessHours || null
  };
}

function appendEscalationContact(baseReply, brand) {
  const contact = getEscalationContact(brand);
  const parts = [baseReply];

  if (contact.whatsapp) parts.push(`WhatsApp: ${contact.whatsapp}`);
  if (contact.email) parts.push(`Email: ${contact.email}`);
  if (contact.hours) parts.push(`Available: ${contact.hours}`);

  return parts.join(" ");
}

function buildEscalationReply(brand) {
  const baseReply =
    brand?.escalationRules?.response ||
    "I understand this is sensitive. I am connecting this to a senior support manager for priority help.";
  return appendEscalationContact(baseReply, brand);
}

function buildConfidenceEscalationReply(brand, language = "english") {
  const baseReply =
    language === "english"
      ? "I could not confirm this accurately, so I am escalating it to the support team rather than guessing."
      : "Mujhe iska confirmed answer nahi mila, isliye guess karne ke bajaye main ise support team ko escalate kar raha hoon.";

  return appendEscalationContact(baseReply, brand);
}

module.exports = {
  detectEscalation,
  buildEscalationReply,
  buildConfidenceEscalationReply,
  getEscalationContact
};
