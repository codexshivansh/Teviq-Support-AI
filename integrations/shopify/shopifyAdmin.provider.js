const { decryptValue, encryptValue } = require("../../services/shopifyCredentials.service");
const { getShopifyConfig } = require("./shopifyConfig");
const connectionStore = require("./shopifyConnection.store");

const refreshLocks = new Map();
const REFRESH_BUFFER_MS = 5 * 60 * 1000;

function addSeconds(seconds) {
  if (!Number.isFinite(Number(seconds))) return null;
  return new Date(Date.now() + Number(seconds) * 1000).toISOString();
}

async function fetchWithTimeout(url, options, timeoutMs = 15000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (error) {
    if (error.name === "AbortError") {
      const timeoutError = new Error("Shopify took too long to respond. Please try again.");
      timeoutError.statusCode = 504;
      timeoutError.code = "shopify_timeout";
      throw timeoutError;
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function requestToken(shopDomain, body) {
  const response = await fetchWithTimeout(
    `https://${shopDomain}/admin/oauth/access_token`,
    {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: new URLSearchParams(body).toString()
    }
  );
  const data = await response.json().catch(() => null);

  if (!response.ok || !data?.access_token) {
    const error = new Error(
      data?.error_description || data?.error || "Shopify could not complete the authorization request."
    );
    error.statusCode = response.status === 401 ? 401 : 502;
    error.code = response.status === 401
      ? "shopify_reauthorization_required"
      : "shopify_token_refresh_failed";
    throw error;
  }

  return data;
}

function tokenNeedsRefresh(connection) {
  if (!connection?.access_token_expires_at) return false;
  return new Date(connection.access_token_expires_at).getTime() <= Date.now() + REFRESH_BUFFER_MS;
}

async function refreshAccessToken(connection) {
  if (!connection.refresh_token_encrypted) {
    const error = new Error("Reconnect Shopify to continue syncing store data.");
    error.statusCode = 401;
    error.code = "shopify_reauthorization_required";
    throw error;
  }

  const config = getShopifyConfig({ required: true });
  const refreshToken = decryptValue(connection.refresh_token_encrypted);
  const tokenData = await requestToken(connection.shop_domain, {
    client_id: config.clientId,
    client_secret: config.clientSecret,
    grant_type: "refresh_token",
    refresh_token: refreshToken
  });

  return connectionStore.updateConnection(connection.brand_id, {
    access_token_encrypted: JSON.stringify(encryptValue(tokenData.access_token)),
    refresh_token_encrypted: tokenData.refresh_token
      ? JSON.stringify(encryptValue(tokenData.refresh_token))
      : connection.refresh_token_encrypted,
    access_token_expires_at: addSeconds(tokenData.expires_in),
    refresh_token_expires_at: addSeconds(tokenData.refresh_token_expires_in),
    scopes: String(tokenData.scope || "")
      .split(",")
      .map((scope) => scope.trim())
      .filter(Boolean),
    status: "active"
  });
}

async function refreshOnce(connection) {
  const brandId = connection.brand_id;
  if (refreshLocks.has(brandId)) return refreshLocks.get(brandId);

  const promise = refreshAccessToken(connection).finally(() => refreshLocks.delete(brandId));
  refreshLocks.set(brandId, promise);
  return promise;
}

async function getAccessContext(brandId) {
  let connection = await connectionStore.getConnectionByBrandId(brandId);
  if (!connection || connection.status !== "active") {
    const error = new Error("Shopify is not connected for this brand.");
    error.statusCode = 409;
    error.code = "shopify_not_connected";
    throw error;
  }

  if (tokenNeedsRefresh(connection)) {
    connection = await refreshOnce(connection);
  }

  return {
    accessToken: decryptValue(connection.access_token_encrypted),
    connection,
    shopDomain: connection.shop_domain
  };
}

async function executeGraphql({ shopDomain, accessToken, query, variables = {} }) {
  const { apiVersion } = getShopifyConfig();
  const response = await fetchWithTimeout(
    `https://${shopDomain}/admin/api/${apiVersion}/graphql.json`,
    {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": accessToken
      },
      body: JSON.stringify({ query, variables })
    }
  );
  const payload = await response.json().catch(() => null);

  if (response.status === 401 || response.status === 403) {
    const error = new Error("Shopify access has expired or was revoked. Reconnect the store.");
    error.statusCode = 401;
    error.code = "shopify_reauthorization_required";
    throw error;
  }

  if (!response.ok || payload?.errors?.length) {
    const detail = payload?.errors?.[0]?.message || `Shopify returned HTTP ${response.status}.`;
    const error = new Error(`Shopify sync failed. ${detail}`);
    error.statusCode = response.status >= 500 ? 502 : 400;
    error.code = "shopify_graphql_error";
    throw error;
  }

  return payload?.data || {};
}

const SUMMARY_QUERY = `query TeviqShopifySummary {
  shop {
    name
    myshopifyDomain
    primaryDomain { url }
  }
  productsCount(limit: 10000) { count precision }
  ordersCount(limit: 10000) { count precision }
}`;

const PRODUCTS_QUERY = `query TeviqProductPreview($first: Int!) {
  products(first: $first, sortKey: UPDATED_AT, reverse: true) {
    nodes {
      id
      title
      handle
      productType
      tags
      status
      totalInventory
      priceRangeV2 {
        minVariantPrice { amount currencyCode }
      }
      featuredMedia {
        ... on MediaImage {
          image { url altText }
        }
      }
    }
  }
}`;

function mapProduct(product) {
  const money = product.priceRangeV2?.minVariantPrice || {};
  return {
    id: product.id,
    title: product.title,
    handle: product.handle,
    category: product.productType || "Uncategorized",
    tags: product.tags || [],
    price: money.amount || "0.00",
    currency: money.currencyCode || "INR",
    available: product.status === "ACTIVE" && product.totalInventory !== 0,
    imageUrl: product.featuredMedia?.image?.url || "",
    imageAlt: product.featuredMedia?.image?.altText || product.title
  };
}

async function getSummaryWithToken({ shopDomain, accessToken }) {
  const data = await executeGraphql({
    shopDomain,
    accessToken,
    query: SUMMARY_QUERY
  });

  return {
    shop: data.shop || {},
    productCount: Number(data.productsCount?.count || 0),
    orderCount: Number(data.ordersCount?.count || 0)
  };
}

async function getProductsWithToken({ shopDomain, accessToken, first = 50 }) {
  const data = await executeGraphql({
    shopDomain,
    accessToken,
    query: PRODUCTS_QUERY,
    variables: { first: Math.max(1, Math.min(Number(first) || 50, 100)) }
  });
  return (data.products?.nodes || []).map(mapProduct);
}

async function getProducts(brandId, options = {}) {
  const context = await getAccessContext(brandId);
  return getProductsWithToken({ ...context, ...options });
}

async function syncBrand(brandId) {
  const context = await getAccessContext(brandId);

  try {
    const [summary, products] = await Promise.all([
      getSummaryWithToken(context),
      getProductsWithToken({ ...context, first: 100 })
    ]);
    const categories = Array.from(new Set(products.map((product) => product.category).filter(Boolean)));
    const syncedAt = new Date().toISOString();
    const updated = await connectionStore.updateConnection(brandId, {
      shop_name: summary.shop.name || context.shopDomain,
      primary_domain_url: summary.shop.primaryDomain?.url || "",
      product_count: summary.productCount,
      order_count: summary.orderCount,
      categories,
      status: "active",
      last_synced_at: syncedAt,
      last_sync_status: "success",
      last_sync_error: null
    });

    return { connection: updated, products, syncedAt };
  } catch (error) {
    await connectionStore.updateConnection(brandId, {
      status: error.code === "shopify_reauthorization_required" ? "error" : "active",
      last_sync_status: "error",
      last_sync_error: String(error.message || "Shopify sync failed.").slice(0, 500)
    }).catch(() => {});
    throw error;
  }
}

module.exports = {
  addSeconds,
  executeGraphql,
  getAccessContext,
  getProducts,
  getProductsWithToken,
  getSummaryWithToken,
  mapProduct,
  requestToken,
  syncBrand,
  tokenNeedsRefresh
};
