const REQUIRED_FIELDS = [
  "id",
  "brand_name",
  "brand_category",
  "support_language",
  "is_active"
];

// Fallback only — used when a brand has no quick_replies set (null or []).
// Mirrors widget.js's own hardcoded getDefaultActions() so brands that
// never configure this keep seeing exactly what they see today.
const DEFAULT_QUICK_REPLIES = [
  { label: "📦 Track my order", message: "Track my order" },
  { label: "↩ Return / Exchange", message: "Return / Exchange" },
  { label: "🚚 Shipping & Delivery", message: "Shipping & Delivery" },
  { label: "👤 Talk to Support", message: "Talk to human" }
];

function isSafeBrandId(brandId) {
  return /^[a-z0-9-]+$/.test(String(brandId || ""));
}

function getSupabaseConfig() {
  const url = String(process.env.SUPABASE_URL || "").replace(/\/$/, "");
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

  if (!url || !serviceRoleKey) {
    return null;
  }

  return { url, serviceRoleKey };
}

function getHeaders(extra = {}) {
  const config = getSupabaseConfig();
  if (!config) return null;

  return {
    apikey: config.serviceRoleKey,
    Authorization: `Bearer ${config.serviceRoleKey}`,
    "Content-Type": "application/json",
    ...extra
  };
}

function getTableUrl(path = "") {
  const config = getSupabaseConfig();
  if (!config) return "";
  return `${config.url}/rest/v1/brands${path}`;
}

async function requestSupabase(path, options = {}) {
  const headers = getHeaders(options.headers);
  if (!headers) {
    const error = new Error("Supabase brand storage is not configured.");
    error.statusCode = 503;
    error.code = "supabase_not_configured";
    throw error;
  }

  const response = await fetch(getTableUrl(path), {
    ...options,
    headers
  });
  
  let data = null;
  try {
    const text = await response.text();
    data = text ? JSON.parse(text) : null;
  } catch (parseError) {
    const error = new Error(`Failed to parse Supabase brands response: ${parseError.message}`);
    error.statusCode = 502;
    error.supabaseStatus = response.status;
    error.originalError = parseError;
    console.error(`[Supabase Parse Error] Brands on ${path}:`, parseError.message);
    throw error;
  }

  if (!response.ok) {
    const error = new Error(data?.message || `Supabase brands request failed with ${response.status}`);
    error.statusCode = response.status;
    error.supabaseStatus = response.status;
    error.data = data;
    console.error(`[Supabase Error] ${response.status} Brands on ${path}:`, data);
    throw error;
  }

  return { data, ok: true, status: response.status };
}

async function callSupabaseSafely(operationLabel, path, options) {
  try {
    return await requestSupabase(path, options);
  } catch (error) {
    console.error(`[Brand operation failed] ${operationLabel}:`, error.message);
    // Ensure statusCode is always set
    if (!error.statusCode) {
      error.statusCode = 503;
    }
    throw error;
  }
}

function normalizeBrand(row) {
  if (!row) return null;
  if (!row.id || !row.brand_name) return null;

  return {
    brandId: row.id,
    brandName: row.brand_name,
    brandCategory: row.brand_category || "",
    supportLanguage: row.support_language || "en",
    isActive: Boolean(row.is_active),
    widgetConfig: {
      widgetTitle: row.welcome_title || "Support",
      welcomeTitle: row.welcome_title || "Welcome to Support",
      welcomeBody:
        row.welcome_body || "Hi there! How can we help you today?",
      inputPlaceholder: row.input_placeholder || "Type your question here...",
      themeColor: row.theme_color || "#4F46E5",
      position: row.position || "bottom-right",
      quickReplies: row.quick_replies || DEFAULT_QUICK_REPLIES
    },
    integrations: {
      shopify: row.shopify_store_url ? { storeUrl: row.shopify_store_url } : null
    },
    contact: {
      phone: row.contact_phone || null,
      email: row.contact_email || null
    },
    businessHours: row.business_hours || null,
    escalationWhatsapp: row.escalation_whatsapp || null,
    createdAt: row.created_at
  };
}

function validateBrandRow(row) {
  const missingFields = REQUIRED_FIELDS.filter((field) => !row[field]);
  if (missingFields.length > 0) {
    return {
      ok: false,
      errors: [`Missing required fields: ${missingFields.join(", ")}`]
    };
  }

  return { ok: true };
}

async function brandExists(brandId) {
  if (!isSafeBrandId(brandId)) return false;

  try {
    const encodedId = encodeURIComponent(brandId);
    const { data } = await callSupabaseSafely(
      `Brand exists check for "${brandId}"`,
      `?id=eq.${encodedId}&select=id`
    );
    return Array.isArray(data) && data.length > 0;
  } catch {
    return false;
  }
}

async function getBrandById(brandId) {
  if (!isSafeBrandId(brandId)) {
    const error = new Error(`Invalid brand ID format: ${brandId}`);
    error.statusCode = 400;
    throw error;
  }

  const encodedId = encodeURIComponent(brandId);
  const { data } = await callSupabaseSafely(
    `Brand lookup for "${brandId}"`,
    `?id=eq.${encodedId}&limit=1`
  );

  const brand = Array.isArray(data) ? data[0] : data;
  return normalizeBrand(brand) || null;
}

async function createBrand(payload) {
  const { ok, errors } = validateBrandRow(payload);
  if (!ok) {
    const error = new Error(`Validation failed: ${errors.join("; ")}`);
    error.statusCode = 400;
    throw error;
  }

  const { data } = await callSupabaseSafely("Brand creation", "", {
    method: "POST",
    body: JSON.stringify(payload)
  });

  return normalizeBrand(Array.isArray(data) ? data[0] : data);
}

async function updateBrand(brandId, updates) {
  if (!isSafeBrandId(brandId)) {
    const error = new Error(`Invalid brand ID format: ${brandId}`);
    error.statusCode = 400;
    throw error;
  }

  const allowedFields = [
    "brand_name",
    "brand_category",
    "support_language",
    "escalation_whatsapp",
    "shopify_store_url",
    "shopify_token_encrypted",
    "welcome_title",
    "welcome_body",
    "quick_replies",
    "input_placeholder",
    "contact_phone",
    "contact_email",
    "business_hours",
    "theme_color",
    "is_active"
  ];
  const payload = {};

  allowedFields.forEach((field) => {
    if (updates[field] !== undefined) {
      payload[field] = updates[field];
    }
  });

  const encodedId = encodeURIComponent(brandId);
  const { data } = await callSupabaseSafely(`Brand update for "${brandId}"`, `?id=eq.${encodedId}`, {
    method: "PATCH",
    headers: {
      Prefer: "return=representation"
    },
    body: JSON.stringify(payload)
  });

  return normalizeBrand(Array.isArray(data) ? data[0] : data);
}

async function deleteBrand(brandId) {
  if (!isSafeBrandId(brandId)) return false;

  const encodedId = encodeURIComponent(brandId);
  await callSupabaseSafely(`Brand deletion for "${brandId}"`, `?id=eq.${encodedId}`, {
    method: "DELETE"
  });

  return true;
}

async function getPublicBrandConfig(brandId) {
  const brand = await getBrandById(brandId);
  if (!brand) return null;
  const widgetConfig = brand.widgetConfig || {};

  return {
    brandName: brand.brandName,
    widgetTitle: widgetConfig.widgetTitle,
    welcomeTitle: widgetConfig.welcomeTitle,
    welcomeBody: widgetConfig.welcomeBody,
    inputPlaceholder: widgetConfig.inputPlaceholder,
    themeColor: widgetConfig.themeColor,
    position: widgetConfig.position,
    quickReplies: widgetConfig.quickReplies || []
  };
}

async function listBrands() {
  const { data } = await callSupabaseSafely("Brand list", "?select=*&order=created_at.asc");
  return (Array.isArray(data) ? data : []).map(normalizeBrand).filter(Boolean);
}

module.exports = {
  REQUIRED_FIELDS,
  brandExists,
  createBrand,
  deleteBrand,
  getBrandById,
  getPublicBrandConfig,
  isSafeBrandId,
  listBrands,
  normalizeBrand,
  updateBrand,
  validateBrand: validateBrandRow
};
