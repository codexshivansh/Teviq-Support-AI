const MAX_MESSAGES_PER_CUSTOMER = 10;
const sessions = new Map();

function getSessionKey(brandId, customerId) {
  return `${brandId}:${customerId || "guest"}`;
}

function getConversationMemory(brandId, customerId) {
  return sessions.get(getSessionKey(brandId, customerId)) || [];
}

function addConversationMessage(brandId, customerId, role, content) {
  const key = getSessionKey(brandId, customerId);
  const existingMessages = sessions.get(key) || [];

  existingMessages.push({
    role,
    content,
    timestamp: new Date().toISOString()
  });

  sessions.set(key, existingMessages.slice(-MAX_MESSAGES_PER_CUSTOMER));
  return sessions.get(key);
}

module.exports = { getConversationMemory, addConversationMessage };
