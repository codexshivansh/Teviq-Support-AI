const ESCALATION_KEYWORDS = [
  "fraud",
  "scam",
  "legal",
  "lawyer",
  "court",
  "police",
  "fir",
  "consumer court",
  "harassment",
  "abuse",
  "abusive",
  "cheat",
  "cheated",
  "fake",
  "threat",
  "kill",
  "suicide",
  "bastard",
  "idiot",
  "stupid",
  "fuck",
  "shit",
  "asshole",
  "madarchod",
  "bhenchod",
  "mc",
  "bc"
];

function detectEscalation(message, brand) {
  const text = message.toLowerCase();
  const brandKeywords = brand?.escalationRules?.hardKeywords || [];
  const keywords = [...new Set([...ESCALATION_KEYWORDS, ...brandKeywords])];
  const matchedKeyword = keywords.find((keyword) =>
    text.includes(keyword)
  );

  return {
    escalated: Boolean(matchedKeyword),
    matchedKeyword: matchedKeyword || null
  };
}

function buildEscalationReply(brand) {
  const contact = brand.managerContact || brand.escalationContact || {};
  const baseReply =
    brand.escalationRules?.response ||
    "I understand this is sensitive. I am connecting this to a senior support manager for priority help.";
  const parts = [
    baseReply
  ];

  if (contact.whatsapp) {
    parts.push(`WhatsApp: ${contact.whatsapp}`);
  }

  if (contact.email) {
    parts.push(`Email: ${contact.email}`);
  }

  if (contact.hours) {
    parts.push(`Available: ${contact.hours}`);
  }

  return parts.join(" ");
}

module.exports = { detectEscalation, buildEscalationReply };
