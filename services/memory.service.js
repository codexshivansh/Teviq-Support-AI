const MAX_MESSAGES_PER_CUSTOMER = 10;
const MAX_PERSISTED_TURNS = Math.ceil(MAX_MESSAGES_PER_CUSTOMER / 2);
const MEMORY_FETCH_TIMEOUT_MS = 3000;
const sessions = new Map();

function getSessionKey(brandId, customerId) {
  return `${brandId}:${customerId || "guest"}`;
}

function getSupabaseConfig() {
  const url = String(process.env.SUPABASE_URL || "").replace(/\/$/, "");
  const serviceRoleKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY || "");
  return url && serviceRoleKey ? { url, serviceRoleKey } : null;
}

function encodeFilter(value) {
  return encodeURIComponent(String(value || ""));
}

async function loadPersistedMemory(brandId, customerId) {
  const config = getSupabaseConfig();
  if (!config) return [];

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), MEMORY_FETCH_TIMEOUT_MS);
  const query = [
    `brand_id=eq.${encodeFilter(brandId)}`,
    `customer_id=eq.${encodeFilter(customerId || "guest")}`,
    "select=message,reply,created_at",
    "order=created_at.desc",
    `limit=${MAX_PERSISTED_TURNS}`
  ].join("&");

  try {
    const response = await fetch(`${config.url}/rest/v1/chat_logs?${query}`, {
      headers: {
        apikey: config.serviceRoleKey,
        Authorization: `Bearer ${config.serviceRoleKey}`
      },
      signal: controller.signal
    });

    if (!response.ok) {
      throw new Error(`chat_logs returned ${response.status}`);
    }

    const rows = await response.json();
    return (Array.isArray(rows) ? rows : [])
      .slice()
      .reverse()
      .flatMap((row) => [
        {
          role: "user",
          content: String(row.message || ""),
          timestamp: row.created_at || null
        },
        {
          role: "assistant",
          content: String(row.reply || ""),
          timestamp: row.created_at || null
        }
      ])
      .filter((message) => message.content);
  } finally {
    clearTimeout(timeoutId);
  }
}

async function getConversationMemory(brandId, customerId) {
  const key = getSessionKey(brandId, customerId);
  const localMessages = sessions.get(key) || [];

  // A single local message is the current customer turn added immediately
  // before prompt construction. Hydrate older completed turns after a cold
  // start, but keep the in-process path fast once a session is warm.
  if (localMessages.length > 1) {
    return localMessages;
  }

  try {
    const persistedMessages = await loadPersistedMemory(brandId, customerId);
    const hydrated = [...persistedMessages, ...localMessages].slice(-MAX_MESSAGES_PER_CUSTOMER);
    sessions.set(key, hydrated);
    return hydrated;
  } catch (error) {
    console.warn(
      `[memory] Persistent history unavailable for brand "${brandId}"; using local memory (${error.name || "Error"}).`
    );
    return localMessages;
  }
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

function resetMemoryForTests() {
  sessions.clear();
}

module.exports = {
  MAX_MESSAGES_PER_CUSTOMER,
  addConversationMessage,
  getConversationMemory,
  loadPersistedMemory,
  resetMemoryForTests
};
