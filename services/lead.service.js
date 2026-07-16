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

function buildLeadCaptureFailureReply(brand) {
  const contact = brand.managerContact || brand.contact || {};
  const directContact = [
    contact.whatsapp ? `WhatsApp: ${contact.whatsapp}` : null,
    contact.phone ? `Phone: ${contact.phone}` : null,
    contact.email ? `Email: ${contact.email}` : null
  ].filter(Boolean);

  return [
    "I could not save your contact details right now. Please try once more or contact the support team directly.",
    directContact.join(" ")
  ].filter(Boolean).join(" ");
}

module.exports = {
  buildLeadCaptureFailureReply,
  buildLeadCaptureReply,
  extractContactInfo,
  hasContactInfo
};
