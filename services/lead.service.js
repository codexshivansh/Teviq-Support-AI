function extractContactInfo(message) {
  const emailMatch = message.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  const phoneMatch = message.match(/(?:\+?91[-\s]?)?[6-9]\d{9}\b/);

  return {
    email: emailMatch ? emailMatch[0] : null,
    phone: phoneMatch ? phoneMatch[0] : null
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
