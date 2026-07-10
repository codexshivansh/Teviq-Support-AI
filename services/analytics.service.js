function getSupabaseConfig() {
  const url = String(process.env.SUPABASE_URL || "").replace(/\/$/, "");
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

  if (!url || !serviceRoleKey) {
    const error = new Error("Supabase chat_logs store is not configured.");
    error.statusCode = 503;
    error.code = "supabase_not_configured";
    throw error;
  }

  return { url, serviceRoleKey };
}

function getHeaders(extra = {}) {
  const { serviceRoleKey } = getSupabaseConfig();
  return {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    "Content-Type": "application/json",
    ...extra
  };
}

function getRestUrl(path) {
  const { url } = getSupabaseConfig();
  return `${url}/rest/v1/chat_logs${path}`;
}

async function request(path, options = {}) {
  const response = await fetch(getRestUrl(path), {
    ...options,
    headers: getHeaders(options.headers)
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;

  if (!response.ok) {
    const error = new Error(data?.message || `Supabase chat_logs request failed with ${response.status}`);
    error.statusCode = response.status;
    error.data = data;
    throw error;
  }

  return data;
}

async function appendChatLog(entry) {
  await request("", {
    method: "POST",
    body: JSON.stringify({
      brand_id: entry.brandId,
      customer_id: entry.customerId,
      message: entry.message,
      detected_intent: entry.detectedIntent,
      escalated: Boolean(entry.escalated),
      source: entry.source,
      reply: entry.reply,
      knowledge_confidence: entry.knowledgeConfidence,
      knowledge_citations: entry.knowledgeCitations || [],
      is_fallback: Boolean(entry.isFallback),
      response_time_ms: entry.responseTimeMs ?? null
    })
  });
}

module.exports = { appendChatLog };
