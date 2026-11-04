const { extractEmail, extractPhone } = require("./privacy.service");
const { appendEscalationContact } = require('./escalation.service');

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
    return appendEscalationContact(`Thanks. I have noted your details for ${brand.brandName}'s team to review. For a direct response, please use the support contact below.`, brand);
  }

  return appendEscalationContact(`Please share your name and phone number or email so I can save your request for ${brand.brandName}'s team to review. You can also contact support directly.`, brand);
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
