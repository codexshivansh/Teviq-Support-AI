const EMAIL_PATTERN = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const PHONE_PATTERN = /(?:\+?91[\s-]?)?[6-9](?:[\s-]?\d){9}\b/g;

function extractEmail(message) {
  const match = String(message || "").match(new RegExp(EMAIL_PATTERN.source, "i"));
  return match ? match[0] : null;
}

function extractPhone(message) {
  const match = String(message || "").match(new RegExp(PHONE_PATTERN.source));
  return match ? match[0] : null;
}

function redactContactInfo(message) {
  return String(message || "")
    .replace(EMAIL_PATTERN, "[email redacted]")
    .replace(PHONE_PATTERN, "[phone redacted]");
}

module.exports = { extractEmail, extractPhone, redactContactInfo };
