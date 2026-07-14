function getSupabaseConfig() {
  const url = String(process.env.SUPABASE_URL || "").replace(/\/$/, "");
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

  if (!url || !serviceRoleKey) {
    const error = new Error("Supabase Shopify storage is not configured.");
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

  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text || null;
  }

  if (!response.ok) {
    const error = new Error(data?.message || `Shopify storage request failed with ${response.status}.`);
    error.statusCode = response.status >= 500 ? 503 : response.status;
    error.supabaseStatus = response.status;
    error.code = data?.code || "shopify_storage_error";
    throw error;
  }

  return data;
}

function firstRow(data) {
  return Array.isArray(data) ? data[0] || null : data || null;
}

function encodeFilter(value) {
  return encodeURIComponent(String(value || ""));
}

async function getConnectionByBrandId(brandId) {
  const data = await requestTable(
    "shopify_connections",
    `?brand_id=eq.${encodeFilter(brandId)}&limit=1`
  );
  return firstRow(data);
}

async function getConnectionByShopDomain(shopDomain) {
  const data = await requestTable(
    "shopify_connections",
    `?shop_domain=eq.${encodeFilter(shopDomain)}&limit=1`
  );
  return firstRow(data);
}

async function upsertConnection(connection) {
  const data = await requestTable("shopify_connections", "?on_conflict=brand_id", {
    method: "POST",
    headers: {
      Prefer: "resolution=merge-duplicates,return=representation"
    },
    body: JSON.stringify(connection)
  });
  return firstRow(data);
}

async function updateConnection(brandId, updates) {
  const data = await requestTable(
    "shopify_connections",
    `?brand_id=eq.${encodeFilter(brandId)}`,
    {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({ ...updates, updated_at: new Date().toISOString() })
    }
  );
  return firstRow(data);
}

async function deleteConnection(brandId) {
  await requestTable(
    "shopify_connections",
    `?brand_id=eq.${encodeFilter(brandId)}`,
    { method: "DELETE" }
  );
  return true;
}

async function createOauthState(state) {
  await requestTable("shopify_oauth_states", "", {
    method: "POST",
    body: JSON.stringify(state)
  });
  return state;
}

async function consumeOauthState(stateHash) {
  const data = await requestTable(
    "shopify_oauth_states",
    `?state_hash=eq.${encodeFilter(stateHash)}&select=*`,
    {
      method: "DELETE",
      headers: { Prefer: "return=representation" }
    }
  );
  return firstRow(data);
}

async function deleteExpiredOauthStates() {
  await requestTable(
    "shopify_oauth_states",
    `?expires_at=lt.${encodeFilter(new Date().toISOString())}`,
    { method: "DELETE" }
  );
}

function toPublicConnection(row) {
  if (!row) return null;

  return {
    brandId: row.brand_id,
    provider: "shopify",
    storeHost: row.shop_domain,
    shopName: row.shop_name || row.shop_domain,
    primaryDomainUrl: row.primary_domain_url || "",
    status: row.status,
    connectedAt: row.connected_at,
    updatedAt: row.updated_at,
    lastSyncedAt: row.last_synced_at,
    lastSyncStatus: row.last_sync_status,
    webhooksStatus: row.webhooks_status || "not_registered",
    webhooksLastRegisteredAt: row.webhooks_last_registered_at || null,
    productCount: Number(row.product_count || 0),
    orderCount: Number(row.order_count || 0),
    categories: Array.isArray(row.categories) ? row.categories : []
  };
}

module.exports = {
  consumeOauthState,
  createOauthState,
  deleteConnection,
  deleteExpiredOauthStates,
  getConnectionByBrandId,
  getConnectionByShopDomain,
  toPublicConnection,
  updateConnection,
  upsertConnection
};
