const { decryptValue } = require("../../services/shopifyCredentials.service");

function getSupabaseConfig() {
  const url = String(process.env.SUPABASE_URL || "").replace(/\/$/, "");
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  if (!url || !serviceRoleKey) {
    const error = new Error("Supabase is not configured for WhatsApp connections.");
    error.statusCode = 503;
    error.code = "supabase_not_configured";
    throw error;
  }
  return { url, serviceRoleKey };
}

async function requestTable(query = "", options = {}) {
  const { url, serviceRoleKey } = getSupabaseConfig();
  const response = await fetch(`${url}/rest/v1/whatsapp_connections${query}`, {
    ...options,
    signal: AbortSignal.timeout(8000),
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
    const error = new Error(data?.message || `WhatsApp storage request failed with ${response.status}.`);
    error.statusCode = response.status >= 500 ? 503 : response.status;
    error.code = data?.code || "whatsapp_storage_error";
    throw error;
  }
  return data;
}

function filter(value) {
  return encodeURIComponent(String(value || ""));
}

function rows(data) {
  return Array.isArray(data) ? data : [];
}

async function listConnectionsByBrand(brandId, { activeOnly = false } = {}) {
  const params = new URLSearchParams({ brand_id: `eq.${brandId}`, select: "brand_id,phone_number_id,waba_id,display_phone_number,verified_name,business_mode,is_active,access_token,access_token_encrypted,connected_at,updated_at" });
  if (activeOnly) params.set("is_active", "eq.true");
  params.set("order", "connected_at.desc.nullslast");
  return rows(await requestTable(`?${params.toString()}`));
}

async function getConnectionByPhoneNumberId(phoneNumberId) {
  const data = await requestTable(`?phone_number_id=eq.${filter(phoneNumberId)}&select=brand_id,phone_number_id,waba_id,display_phone_number,verified_name,business_mode,is_active,access_token,access_token_encrypted,connected_at,updated_at&limit=1`);
  return rows(data)[0] || null;
}

async function upsertConnection(connection) {
  const existing = await getConnectionByPhoneNumberId(connection.phone_number_id);
  if (existing && existing.brand_id !== connection.brand_id) {
    const error = new Error("This WhatsApp number is already linked to another workspace.");
    error.statusCode = 409;
    error.code = "whatsapp_number_already_linked";
    throw error;
  }
  const now = new Date().toISOString();
  const payload = { ...connection, updated_at: now };
  if (existing) {
    const data = await requestTable(`?phone_number_id=eq.${filter(connection.phone_number_id)}`, {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify(payload)
    });
    return rows(data)[0] || null;
  }
  const data = await requestTable("", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({ ...payload, connected_at: now })
  });
  return rows(data)[0] || null;
}

async function disconnectBrand(brandId) {
  await requestTable(`?brand_id=eq.${filter(brandId)}&is_active=eq.true`, {
    method: "PATCH",
    body: JSON.stringify({ is_active: false, updated_at: new Date().toISOString() })
  });
}

function getAccessToken(row) {
  if (row?.access_token_encrypted) return decryptValue(row.access_token_encrypted);
  // Backwards compatibility for existing manually provisioned connections.
  return row?.access_token || null;
}

function toPublicConnection(row) {
  if (!row) return null;
  return {
    phoneNumberId: row.phone_number_id,
    wabaId: row.waba_id || null,
    displayPhoneNumber: row.display_phone_number || null,
    verifiedName: row.verified_name || null,
    status: row.is_active ? "active" : "disconnected",
    connectedAt: row.connected_at || null,
    updatedAt: row.updated_at || null
  };
}

module.exports = {
  disconnectBrand,
  getAccessToken,
  getConnectionByPhoneNumberId,
  listConnectionsByBrand,
  toPublicConnection,
  upsertConnection
};
