function getSupabaseConfig() {
  const url = String(process.env.SUPABASE_URL || "").replace(/\/$/, "");
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

  if (!url || !serviceRoleKey) {
    const error = new Error("Supabase conversation state store is not configured.");
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
  return `${url}/rest/v1/conversation_states${path}`;
}

function encodeFilter(value) {
  return encodeURIComponent(String(value || ""));
}

async function request(path, options = {}) {
  const response = await fetch(getRestUrl(path), {
    ...options,
    headers: getHeaders(options.headers)
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;

  if (!response.ok) {
    const error = new Error(data?.message || `Supabase conversation_states request failed with ${response.status}`);
    error.statusCode = response.status;
    error.data = data;
    throw error;
  }

  return data;
}

async function getState(brandId, customerId, channel = "widget") {
  const rows = await request(
    `?brand_id=eq.${encodeFilter(brandId)}&customer_id=eq.${encodeFilter(customerId)}&channel=eq.${encodeFilter(channel)}&select=*`
  );

  if (!Array.isArray(rows) || !rows.length) {
    return { state: "idle", context: {}, updatedAt: null };
  }

  const row = rows[0];
  return {
    state: row.state,
    context: row.context || {},
    updatedAt: row.updated_at
  };
}

async function setState(brandId, customerId, channel = "widget", state, context = {}) {
  const now = new Date().toISOString();

  await request("?on_conflict=brand_id,customer_id,channel", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates" },
    body: JSON.stringify({
      brand_id: brandId,
      customer_id: customerId,
      channel,
      state,
      context,
      updated_at: now
    })
  });

  return { state, context, updatedAt: now };
}

module.exports = { getState, setState };
