function extractOrderId(message) {
  const match = message.match(
    /(?:#|\border\s*(?:id|number|no\.?)?\s*(?:is|:)?\s*)?([a-z]{2,6}[-_\s]?\d{4,})\b/i
  );

  return match ? match[1].replace(/[-_\s]/g, "").toUpperCase() : null;
}

function extractPhone(message) {
  const match = message.match(/(?:\+?91[-\s]?)?[6-9]\d{9}\b/);
  return match ? match[0] : null;
}

function extractEmail(message) {
  const match = message.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  return match ? match[0] : null;
}

function extractName(message) {
  const match = message.match(/\b(?:my name is|i am|i'm|name is)\s+([a-z][a-z\s]{1,40})\b/i);
  return match ? match[1].trim().replace(/\s+/g, " ") : null;
}

function extractSize(message) {
  const match = message.match(/\b(xs|s|m|l|xl|xxl|xxxl|small|medium|large|extra large|[2-4][0-9])\b/i);
  return match ? match[0].toUpperCase() : null;
}

function extractColor(message) {
  const match = message.match(/\b(black|white|red|blue|green|yellow|pink|purple|brown|grey|gray|beige|cream|gold|silver|navy|maroon)\b/i);
  return match ? match[0].toLowerCase() : null;
}

function extractLocation(message) {
  const pincode = message.match(/\b[1-9][0-9]{5}\b/);
  if (pincode) return pincode[0];

  const location = message.match(/\b(?:in|to|for)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\b/);
  return location ? location[1] : null;
}

function extractProductName(message) {
  const match = message.match(/\b(?:product|item|for|buy|recommend)\s+([a-z0-9][a-z0-9\s-]{2,50})\b/i);
  return match ? match[1].trim() : null;
}

function extractIssue(message) {
  const issueWords = ["damaged", "defective", "wrong item", "missing", "late", "not working", "rash", "allergy", "broken", "size issue"];
  const found = issueWords.find((word) => message.toLowerCase().includes(word));
  return found || null;
}

function extractEntities(message) {
  return {
    orderId: extractOrderId(message),
    phone: extractPhone(message),
    email: extractEmail(message),
    name: extractName(message),
    productName: extractProductName(message),
    size: extractSize(message),
    color: extractColor(message),
    location: extractLocation(message),
    issue: extractIssue(message)
  };
}

module.exports = { extractEntities, extractOrderId };
