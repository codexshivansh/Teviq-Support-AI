const PREFIXED_ORDER_PATTERN =
  /(?:#|\border\s*(?:id|number|no\.?)?\s*(?:is|:)?\s*)?([a-z]{2,6}(?:[-_][a-z]{2,6})?[-_]?\d{3,8})\b/i;
const CONTEXTUAL_NUMERIC_ORDER_PATTERN =
  /(?:#\s*|\border\s*(?:id|number|no\.?)?\s*(?:is|:)?\s*#?\s*)(\d{3,12})\b/i;
const BARE_NUMERIC_ORDER_PATTERN = /^\s*#?(\d{3,8})\s*$/;

function normalizeOrderId(value) {
  const rawValue = String(value || "").trim();
  if (!rawValue) return null;

  const numericMatch = rawValue.match(/^#?\s*(\d{3,12})$/);
  if (numericMatch) return `#${numericMatch[1]}`;

  return rawValue.replace(/^#/, "").replace(/[-_\s]/g, "").toUpperCase() || null;
}

function extractOrderId(message) {
  const text = String(message || "");
  const prefixedMatch = text.match(PREFIXED_ORDER_PATTERN);
  if (prefixedMatch) return normalizeOrderId(prefixedMatch[1]);

  const numericMatch = text.match(CONTEXTUAL_NUMERIC_ORDER_PATTERN) || text.match(BARE_NUMERIC_ORDER_PATTERN);
  return numericMatch ? normalizeOrderId(numericMatch[1]) : null;
}

module.exports = {
  extractOrderId,
  normalizeOrderId
};
