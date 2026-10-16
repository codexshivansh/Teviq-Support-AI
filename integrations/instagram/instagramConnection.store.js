function getSupabaseConfig() {
  const url = String(process.env.SUPABASE_URL || "").replace(/\/$/, "");
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  if (!url || !serviceRoleKey) {
    const error = new Error("Supabase is not configured for Instagram connections.");
    error.statusCode = 503;
    error.code = "supabase_not_configured";
    throw error;
  }
  return { url, serviceRoleKey };
}

async function requestTable(table, query = "", options = {}) {
  const { url, serviceRoleKey } = getSupabaseConfig();
  const response = await fetch(`${url}/rest/v1/${table}${query}`, {
    ...options,
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });
  const text = await response.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text || null; }
  if (!response.ok) {
    const error = new Error(data?.message || `Instagram storage request failed with ${response.status}.`);
    error.statusCode = response.status >= 500 ? 503 : response.status;
    error.code = data?.code || "instagram_storage_error";
    throw error;
  }
  return data;
}

function encodeFilter(value) {
  return encodeURIComponent(String(value || ""));
}

function firstRow(data) {
  return Array.isArray(data) ? data[0] || null : data || null;
}

async function createOauthState(state) {
  await requestTable("instagram_oauth_states", "", {
    method: "POST",
    body: JSON.stringify(state)
  });
}

async function consumeOauthState(stateHash) {
  const rows = await requestTable(
    "instagram_oauth_states",
    `?state_hash=eq.${encodeFilter(stateHash)}&select=*`,
    { method: "DELETE", headers: { Prefer: "return=representation" } }
  );
  return firstRow(rows);
}

async function deleteExpiredOauthStates() {
  await requestTable(
    "instagram_oauth_states",
    `?expires_at=lt.${encodeFilter(new Date().toISOString())}`,
    { method: "DELETE" }
  );
}

async function getConnectionByBrandId(brandId) {
  const rows = await requestTable(
    "instagram_connections",
    `?brand_id=eq.${encodeFilter(brandId)}&limit=1`
  );
  return firstRow(rows);
}

async function listConnectionsExpiringBefore(cutoffIso) {
  const query = new URLSearchParams({
    status: "eq.active",
    token_expires_at: `lt.${cutoffIso}`,
    select: "brand_id,instagram_user_id,access_token_encrypted,token_issued_at,token_expires_at,connected_at",
    order: "token_expires_at.asc"
  });
  const rows = await requestTable("instagram_connections", `?${query}`);
  return Array.isArray(rows) ? rows : [];
}

async function updateConnection(brandId, updates) {
  const rows = await requestTable(
    "instagram_connections",
    `?brand_id=eq.${encodeFilter(brandId)}`,
    {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({ ...updates, updated_at: new Date().toISOString() })
    }
  );
  return firstRow(rows);
}

async function upsertConnection(connection) {
  const rows = await requestTable("instagram_connections", "?on_conflict=brand_id", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=representation" },
    body: JSON.stringify(connection)
  });
  return firstRow(rows);
}

async function deleteConnection(brandId) {
  await requestTable("instagram_connections", `?brand_id=eq.${encodeFilter(brandId)}`, {
    method: "DELETE"
  });
}

function toPublicConnection(row) {
  if (!row) return null;
  return {
    brandId: row.brand_id,
    provider: "instagram",
    instagramUserId: row.instagram_user_id,
    username: row.username || null,
    scopes: Array.isArray(row.scopes) ? row.scopes : [],
    status: row.status,
    connectedAt: row.connected_at,
    updatedAt: row.updated_at
  };
}

module.exports = {
  consumeOauthState,
  createOauthState,
  deleteConnection,
  deleteExpiredOauthStates,
  getConnectionByBrandId,
  listConnectionsExpiringBefore,
  toPublicConnection,
  updateConnection,
  upsertConnection
};
