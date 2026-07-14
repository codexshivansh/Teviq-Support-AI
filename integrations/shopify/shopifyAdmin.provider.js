const { decryptValue, encryptValue } = require("../../services/shopifyCredentials.service");
const { getShopifyConfig } = require("./shopifyConfig");
const connectionStore = require("./shopifyConnection.store");
const cacheStore = require("./shopifyCache.store");

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

const PRODUCTS_QUERY = `query TeviqProducts($first: Int!, $after: String) {
  products(first: $first, after: $after, sortKey: UPDATED_AT, reverse: true) {
    nodes {
      id
      legacyResourceId
      title
      handle
      productType
      tags
      status
      updatedAt
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
    pageInfo { hasNextPage endCursor }
  }
}`;

const ORDERS_QUERY = `query TeviqOrders($first: Int!, $after: String) {
  orders(first: $first, after: $after, sortKey: UPDATED_AT, reverse: true) {
    nodes {
      id
      legacyResourceId
      name
      displayFulfillmentStatus
      displayFinancialStatus
      cancelledAt
      processedAt
      updatedAt
      lineItems(first: 100) {
        nodes {
          title
          quantity
          sku
          product { id }
          variant { id }
        }
      }
      fulfillments(first: 50) {
        id
        legacyResourceId
        status
        updatedAt
        trackingInfo(first: 10) { company number url }
      }
    }
    pageInfo { hasNextPage endCursor }
  }
}`;

function mapProduct(product) {
  const money = product.priceRangeV2?.minVariantPrice || {};
  return {
    id: product.id,
    legacyResourceId: product.legacyResourceId ? String(product.legacyResourceId) : null,
    title: product.title,
    handle: product.handle,
    category: product.productType || "Uncategorized",
    tags: product.tags || [],
    status: product.status || null,
    price: money.amount || "0.00",
    currency: money.currencyCode || "INR",
    available: product.status === "ACTIVE" && product.totalInventory !== 0,
    imageUrl: product.featuredMedia?.image?.url || "",
    imageAlt: product.featuredMedia?.image?.altText || product.title,
    updatedAt: product.updatedAt || null
  };
}

function mapOrder(order) {
  return {
    id: order.id,
    legacyResourceId: order.legacyResourceId ? String(order.legacyResourceId) : null,
    name: order.name || "",
    fulfillmentStatus: order.displayFulfillmentStatus || null,
    financialStatus: order.displayFinancialStatus || null,
    cancelledAt: order.cancelledAt || null,
    processedAt: order.processedAt || null,
    updatedAt: order.updatedAt || null,
    lineItems: (order.lineItems?.nodes || []).map((item) => ({
      title: item.title || "",
      quantity: Number(item.quantity || 0),
      sku: item.sku || "",
      productId: item.product?.id || null,
      variantId: item.variant?.id || null
    })),
    fulfillments: (order.fulfillments || []).map((fulfillment) => ({
      id: fulfillment.id,
      legacyResourceId: fulfillment.legacyResourceId
        ? String(fulfillment.legacyResourceId)
        : null,
      status: fulfillment.status || "",
      tracking: (fulfillment.trackingInfo || []).map((tracking) => ({
        company: tracking.company || "",
        number: tracking.number || "",
        url: tracking.url || ""
      })),
      updatedAt: fulfillment.updatedAt || null
    }))
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

async function getProductPageWithToken({ shopDomain, accessToken, first = 50, after = null }) {
  const data = await executeGraphql({
    shopDomain,
    accessToken,
    query: PRODUCTS_QUERY,
    variables: { first: Math.max(1, Math.min(Number(first) || 50, 100)), after }
  });
  return {
    items: (data.products?.nodes || []).map(mapProduct),
    pageInfo: data.products?.pageInfo || { hasNextPage: false, endCursor: null }
  };
}

async function getProductsWithToken(options) {
  const page = await getProductPageWithToken(options);
  return page.items;
}

async function getOrderPageWithToken({ shopDomain, accessToken, first = 50, after = null }) {
  const data = await executeGraphql({
    shopDomain,
    accessToken,
    query: ORDERS_QUERY,
    variables: { first: Math.max(1, Math.min(Number(first) || 50, 100)), after }
  });
  return {
    items: (data.orders?.nodes || []).map(mapOrder),
    pageInfo: data.orders?.pageInfo || { hasNextPage: false, endCursor: null }
  };
}

async function collectPages(fetchPage, options = {}) {
  const maxPages = Math.max(1, Math.min(Number(options.maxPages) || 50, 100));
  const items = [];
  let after = null;
  let complete = false;

  for (let pageNumber = 0; pageNumber < maxPages; pageNumber += 1) {
    const page = await fetchPage({ ...options, first: 100, after });
    items.push(...page.items);
    if (!page.pageInfo.hasNextPage || !page.pageInfo.endCursor) {
      complete = true;
      break;
    }
    after = page.pageInfo.endCursor;
  }

  return { items, complete };
}

async function getAllProductsWithToken(options) {
  return collectPages(getProductPageWithToken, options);
}

async function getAllOrdersWithToken(options) {
  return collectPages(getOrderPageWithToken, {
    ...options,
    maxPages: Number(process.env.SHOPIFY_ORDER_SYNC_MAX_PAGES) || 20
  });
}

async function getProducts(brandId, options = {}) {
  const context = await getAccessContext(brandId);
  return getProductsWithToken({ ...context, ...options });
}

async function syncBrand(brandId) {
  const context = await getAccessContext(brandId);
  const syncStartedAt = new Date().toISOString();

  try {
    const [summary, productResult, orderResult] = await Promise.all([
      getSummaryWithToken(context),
      getAllProductsWithToken({
        ...context,
        maxPages: Number(process.env.SHOPIFY_PRODUCT_SYNC_MAX_PAGES) || 50
      }),
      getAllOrdersWithToken(context)
    ]);
    const products = productResult.items;
    const orders = orderResult.items;
    const cacheResult = await cacheStore.reconcileBrand(brandId, context.shopDomain, {
      products,
      orders,
      syncStartedAt,
      productsComplete: productResult.complete,
      ordersComplete: orderResult.complete
    });
    const categories = Array.from(new Set(products.map((product) => product.category).filter(Boolean)));
    const syncedAt = cacheResult.syncedAt;
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

    return {
      connection: updated,
      products,
      orders,
      syncedAt,
      complete: {
        products: productResult.complete,
        orders: orderResult.complete
      }
    };
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
  getAllOrdersWithToken,
  getAllProductsWithToken,
  getOrderPageWithToken,
  getProductPageWithToken,
  getProducts,
  getProductsWithToken,
  getSummaryWithToken,
  mapOrder,
  mapProduct,
  requestToken,
  syncBrand,
  tokenNeedsRefresh
};
