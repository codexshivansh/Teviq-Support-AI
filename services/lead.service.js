const { extractEmail, extractPhone } = require("./privacy.service");

function extractContactInfo(message) {
  return {
    email: extractEmail(message),
    phone: extractPhone(message)
  };
}

function hasContactInfo(message) {
  const contact = extractContactInfo(message);
  return Boolean(contact.email || contact.phone);
}

function buildLeadCaptureReply(brand, message) {
  if (hasContactInfo(message)) {
    return `Thanks. I have noted your details for ${brand.brandName}. Our team will contact you soon.`;
  }

  return `Sure, I can help with that. Please share your name and phone number or email, and ${brand.brandName}'s team will get back to you.`;
}

module.exports = { buildLeadCaptureReply, extractContactInfo, hasContactInfo };
