const crypto = require("crypto");

function getSupabaseConfig() {
  const url = String(process.env.SUPABASE_URL || "").replace(/\/$/, "");
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

  if (!url || !serviceRoleKey) {
    const error = new Error("Supabase return_requests store is not configured.");
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
  return `${url}/rest/v1/return_requests${path}`;
}

async function request(path, options = {}) {
  const response = await fetch(getRestUrl(path), {
    ...options,
    headers: getHeaders(options.headers)
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;

  if (!response.ok) {
    const error = new Error(data?.message || `Supabase return_requests request failed with ${response.status}`);
    error.statusCode = response.status;
    error.data = data;
    throw error;
  }

  return data;
}

function createId(requestType) {
  return `${requestType}_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
}

function encodeFilter(value) {
  return encodeURIComponent(String(value || ""));
}

async function createReturnRequestRecord({
  brandId,
  orderId,
  customerId,
  requestType = "return",
  reasonCode = null,
  customerNote = null,
  lineItems = [],
  status = "pending",
  shopifyReturnId = null,
  shopifyError = null,
  metadata = {}
}) {
  const now = new Date().toISOString();
  const row = {
    id: createId(requestType),
    brand_id: brandId,
    order_id: orderId,
    customer_id: customerId,
    request_type: requestType,
    reason_code: reasonCode,
    customer_note: customerNote,
    line_items: lineItems,
    status,
    shopify_return_id: shopifyReturnId,
    shopify_error: shopifyError,
    metadata,
    created_at: now,
    updated_at: now
  };

  const rows = await request("", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify(row)
  });

  return Array.isArray(rows) ? rows[0] : rows;
}

// Idempotency check: is there already an in-flight (not failed/declined)
// request of this type for this order? Used before auto-executing an
// order-cancellation so the same order can't be cancelled twice from two
// separate confirm messages (e.g. a retried/duplicate customer message).
async function findActiveRequest({ brandId, orderId, requestType }) {
  const rows = await request(
    `?brand_id=eq.${encodeFilter(brandId)}&order_id=eq.${encodeFilter(orderId)}&request_type=eq.${encodeFilter(requestType)}&status=not.in.(shopify_failed,declined)&select=*&order=created_at.desc&limit=1`
  );

  return Array.isArray(rows) && rows.length ? rows[0] : null;
}

module.exports = { createReturnRequestRecord, findActiveRequest };
