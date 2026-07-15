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
    const error = new Error(data?.message || `Shopify cache request failed with ${response.status}.`);
    error.statusCode = response.status >= 500 ? 503 : response.status;
    error.supabaseStatus = response.status;
    error.code = data?.code || "shopify_cache_error";
    throw error;
  }

  return data;
}

async function countRows(table, brandId) {
  const { url, serviceRoleKey } = getSupabaseConfig();
  const response = await fetch(
    `${url}/rest/v1/${table}?brand_id=eq.${encodeFilter(brandId)}&select=brand_id`,
    {
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        Prefer: "count=exact",
        Range: "0-0"
      }
    }
  );

  if (!response.ok) {
    const error = new Error(`Shopify cache count failed with ${response.status}.`);
    error.statusCode = response.status >= 500 ? 503 : response.status;
    error.supabaseStatus = response.status;
    error.code = "shopify_cache_error";
    throw error;
  }

  const contentRange = response.headers.get("content-range") || "*/0";
  const total = Number(contentRange.split("/")[1]);
  return Number.isFinite(total) ? total : 0;
}

function encodeFilter(value) {
  return encodeURIComponent(String(value ?? ""));
}

function orderNameCandidates(orderReference) {
  const value = String(orderReference || "").trim();
  if (!value) return [];

  const withoutHash = value.replace(/^#/, "");
  return [...new Set([value, withoutHash, `#${withoutHash}`].filter(Boolean))];
}

function chunkRows(rows, size = 200) {
  const chunks = [];
  for (let index = 0; index < rows.length; index += size) {
    chunks.push(rows.slice(index, index + size));
  }
  return chunks;
}

async function upsertRows(table, conflictColumns, rows) {
  if (!rows.length) return [];
  const written = [];

  for (const batch of chunkRows(rows)) {
    const data = await requestTable(
      table,
      `?on_conflict=${encodeURIComponent(conflictColumns)}`,
      {
        method: "POST",
        headers: { Prefer: "resolution=merge-duplicates,return=representation" },
        body: JSON.stringify(batch)
      }
    );
    if (Array.isArray(data)) written.push(...data);
  }

  return written;
}

function productRow(brandId, shopDomain, product, syncedAt = new Date().toISOString()) {
  return {
    brand_id: brandId,
    shopify_product_id: String(product.id),
    legacy_resource_id: product.legacyResourceId ? String(product.legacyResourceId) : null,
    shop_domain: shopDomain,
    title: String(product.title || ""),
    handle: String(product.handle || ""),
    category: String(product.category || "Uncategorized"),
    tags: Array.isArray(product.tags) ? product.tags : [],
    status: product.status ? String(product.status) : null,
    price: String(product.price || "0.00"),
    currency: String(product.currency || "INR"),
    available: Boolean(product.available),
    image_url: product.imageUrl ? String(product.imageUrl) : null,
    image_alt: product.imageAlt ? String(product.imageAlt) : null,
    shopify_updated_at: product.updatedAt || null,
    synced_at: syncedAt
  };
}

function orderRow(brandId, shopDomain, order, syncedAt = new Date().toISOString()) {
  return {
    brand_id: brandId,
    shopify_order_id: String(order.id),
    legacy_resource_id: order.legacyResourceId ? String(order.legacyResourceId) : null,
    shop_domain: shopDomain,
    order_name: String(order.name || ""),
    fulfillment_status: order.fulfillmentStatus ? String(order.fulfillmentStatus) : null,
    financial_status: order.financialStatus ? String(order.financialStatus) : null,
    cancelled_at: order.cancelledAt || null,
    processed_at: order.processedAt || null,
    shopify_updated_at: order.updatedAt || null,
    line_items: Array.isArray(order.lineItems) ? order.lineItems : [],
    fulfillments: Array.isArray(order.fulfillments) ? order.fulfillments : [],
    synced_at: syncedAt
  };
}

async function upsertProducts(brandId, shopDomain, products, syncedAt) {
  return upsertRows(
    "shopify_products",
    "brand_id,shopify_product_id",
    products.map((product) => productRow(brandId, shopDomain, product, syncedAt))
  );
}

async function upsertOrders(brandId, shopDomain, orders, syncedAt) {
  return upsertRows(
    "shopify_orders",
    "brand_id,shopify_order_id",
    orders.map((order) => orderRow(brandId, shopDomain, order, syncedAt))
  );
}

async function deleteStaleRows(table, brandId, syncStartedAt) {
  await requestTable(
    table,
    `?brand_id=eq.${encodeFilter(brandId)}&synced_at=lt.${encodeFilter(syncStartedAt)}`,
    { method: "DELETE" }
  );
}

async function reconcileBrand(
  brandId,
  shopDomain,
  { products, orders, syncStartedAt, productsComplete = true, ordersComplete = true }
) {
  const syncedAt = new Date().toISOString();
  await upsertProducts(brandId, shopDomain, products, syncedAt);
  await upsertOrders(brandId, shopDomain, orders, syncedAt);
  if (productsComplete) await deleteStaleRows("shopify_products", brandId, syncStartedAt);
  if (ordersComplete) await deleteStaleRows("shopify_orders", brandId, syncStartedAt);
  return { productCount: products.length, orderCount: orders.length, syncedAt };
}

async function deleteProduct(brandId, shopifyProductId) {
  await requestTable(
    "shopify_products",
    `?brand_id=eq.${encodeFilter(brandId)}&shopify_product_id=eq.${encodeFilter(shopifyProductId)}`,
    { method: "DELETE" }
  );
}

async function listProducts(brandId, limit = 50) {
  const safeLimit = Math.max(1, Math.min(Number(limit) || 50, 100));
  const data = await requestTable(
    "shopify_products",
    `?brand_id=eq.${encodeFilter(brandId)}` +
      "&select=shopify_product_id,legacy_resource_id,title,handle,category,tags,status,price,currency,available,image_url,image_alt,shopify_updated_at" +
      `&order=shopify_updated_at.desc.nullslast&limit=${safeLimit}`
  );

  return (Array.isArray(data) ? data : []).map((product) => ({
    id: product.shopify_product_id,
    legacyResourceId: product.legacy_resource_id,
    title: product.title,
    handle: product.handle,
    category: product.category,
    tags: Array.isArray(product.tags) ? product.tags : [],
    status: product.status,
    price: product.price,
    currency: product.currency,
    available: Boolean(product.available),
    imageUrl: product.image_url,
    imageAlt: product.image_alt,
    updatedAt: product.shopify_updated_at
  }));
}

async function getOrderByLegacyId(brandId, legacyResourceId) {
  const data = await requestTable(
    "shopify_orders",
    `?brand_id=eq.${encodeFilter(brandId)}&legacy_resource_id=eq.${encodeFilter(legacyResourceId)}&limit=1`
  );
  return Array.isArray(data) ? data[0] || null : data || null;
}

async function getOrderByReference(brandId, orderReference) {
  if (!brandId || !orderReference) return null;

  for (const candidate of orderNameCandidates(orderReference)) {
    const data = await requestTable(
      "shopify_orders",
      `?brand_id=eq.${encodeFilter(brandId)}` +
        `&order_name=ilike.${encodeFilter(candidate)}` +
        "&select=shopify_order_id,legacy_resource_id,shop_domain,order_name,fulfillment_status,financial_status,cancelled_at,processed_at,shopify_updated_at,line_items,fulfillments,synced_at" +
        "&limit=1"
    );
    const order = Array.isArray(data) ? data[0] || null : data || null;
    if (order) return order;
  }

  return null;
}

async function updateOrder(brandId, shopifyOrderId, updates) {
  const data = await requestTable(
    "shopify_orders",
    `?brand_id=eq.${encodeFilter(brandId)}&shopify_order_id=eq.${encodeFilter(shopifyOrderId)}`,
    {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({ ...updates, synced_at: new Date().toISOString() })
    }
  );
  return Array.isArray(data) ? data[0] || null : data || null;
}

async function clearBrandCache(brandId) {
  await Promise.all([
    requestTable("shopify_products", `?brand_id=eq.${encodeFilter(brandId)}`, { method: "DELETE" }),
    requestTable("shopify_orders", `?brand_id=eq.${encodeFilter(brandId)}`, { method: "DELETE" })
  ]);
}

async function claimWebhookEvent(event) {
  const data = await requestTable(
    "shopify_webhook_events",
    "?on_conflict=webhook_id",
    {
      method: "POST",
      headers: { Prefer: "resolution=ignore-duplicates,return=representation" },
      body: JSON.stringify(event)
    }
  );
  if (Array.isArray(data) && data.length > 0) return true;

  const existingData = await requestTable(
    "shopify_webhook_events",
    `?webhook_id=eq.${encodeFilter(event.webhook_id)}&select=status,received_at&limit=1`
  );
  const existing = Array.isArray(existingData) ? existingData[0] || null : existingData || null;
  const staleProcessing = existing?.status === "processing" &&
    new Date(existing.received_at).getTime() < Date.now() - 2 * 60 * 1000;
  if (existing?.status !== "failed" && !staleProcessing) return false;

  const retryQuery = existing.status === "failed"
    ? `?webhook_id=eq.${encodeFilter(event.webhook_id)}&status=eq.failed`
    : `?webhook_id=eq.${encodeFilter(event.webhook_id)}&status=eq.processing&received_at=lt.${encodeFilter(new Date(Date.now() - 2 * 60 * 1000).toISOString())}`;
  const reclaimed = await requestTable("shopify_webhook_events", retryQuery, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      status: "processing",
      error: null,
      processed_at: null,
      received_at: new Date().toISOString()
    })
  });
  return Array.isArray(reclaimed) && reclaimed.length > 0;
}

async function finishWebhookEvent(webhookId, status, updates = {}) {
  await requestTable(
    "shopify_webhook_events",
    `?webhook_id=eq.${encodeFilter(webhookId)}`,
    {
      method: "PATCH",
      body: JSON.stringify({
        status,
        error: updates.error ? String(updates.error).slice(0, 500) : null,
        resource_id: updates.resourceId ? String(updates.resourceId) : null,
        processed_at: new Date().toISOString()
      })
    }
  );
}

module.exports = {
  claimWebhookEvent,
  clearBrandCache,
  countRows,
  deleteProduct,
  finishWebhookEvent,
  getOrderByLegacyId,
  getOrderByReference,
  listProducts,
  orderRow,
  productRow,
  reconcileBrand,
  requestTable,
  updateOrder,
  upsertOrders,
  upsertProducts
};
