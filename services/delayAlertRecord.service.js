function getSupabaseConfig() {
  const url = String(process.env.SUPABASE_URL || "").replace(/\/$/, "");
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

  if (!url || !serviceRoleKey) {
    const error = new Error("Supabase delay_alerts_sent store is not configured.");
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
  return `${url}/rest/v1/delay_alerts_sent${path}`;
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
    const error = new Error(data?.message || `Supabase delay_alerts_sent request failed with ${response.status}`);
    error.statusCode = response.status;
    error.data = data;
    throw error;
  }

  return data;
}

async function hasAlertBeenSent({ brandId, orderId }) {
  const rows = await request(
    `?brand_id=eq.${encodeFilter(brandId)}&order_id=eq.${encodeFilter(orderId)}&select=brand_id`
  );
  return Array.isArray(rows) && rows.length > 0;
}

async function recordAlertAttempt({ brandId, orderId, customerPhone = null, status, errorMessage = null }) {
  const row = {
    brand_id: brandId,
    order_id: orderId,
    customer_phone: customerPhone,
    status,
    error_message: errorMessage,
    sent_at: new Date().toISOString()
  };

  await request("", {
    method: "POST",
    body: JSON.stringify(row)
  });
}

module.exports = { hasAlertBeenSent, recordAlertAttempt };
