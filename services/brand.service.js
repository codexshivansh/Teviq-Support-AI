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
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;

  if (!response.ok) {
    const error = new Error(data?.message || `Supabase brands request failed with ${response.status}`);
    error.statusCode = response.status;
    error.data = data;
    throw error;
  }

  return { data, ok: true, status: response.status };
}

async function callSupabaseSafely(operationLabel, path, options) {
  try {
    return await requestSupabase(path, options);
  } catch (error) {
    console.error(`[brand] ${operationLabel} failed: ${error.message}`);
    const wrapped = new Error(`${operationLabel} failed: ${error.message}`);
    wrapped.statusCode = error.statusCode || 503;
    wrapped.code = error.code || "brand_supabase_error";
    throw wrapped;
  }
}

function validateBrandRow(row) {
  const missingFields = REQUIRED_FIELDS.filter((field) => row?.[field] == null);

  return {
    valid: missingFields.length === 0,
    missingFields
  };
}

function buildTone(row) {
  const language = row.support_language || "English";
  return `${language} first, helpful, concise, professional`;
}

function getWelcomeTitle(row) {
  return row.welcome_title || "How can I help?";
}

function getWelcomeBody(row) {
  return row.welcome_body || "I can help with orders, returns, warranty, and product questions.";
}

function getInputPlaceholder(row) {
  return row.input_placeholder || "Ask about orders, returns, size...";
}

function getQuickReplies(row) {
  return Array.isArray(row.quick_replies) && row.quick_replies.length > 0
    ? row.quick_replies
    : DEFAULT_QUICK_REPLIES;
}

function normalizeBrand(row) {
  if (!row) return null;

  const brandName = row.brand_name || row.id;
  const escalationWhatsapp = row.escalation_whatsapp || "";
  const contactPhone = row.contact_phone || "";
  const contactEmail = row.contact_email || "";
  const businessHours = row.business_hours || "";

  return {
    id: row.id,
    brandId: row.id,
    brandName,
    name: brandName,
    industry: row.brand_category || "Other",
    supportLanguage: row.support_language || "English",
    tone: buildTone(row),
    isActive: row.is_active !== false,
    contactPhone,
    contactEmail,
    businessHours,
    managerContact: {
      name: `${brandName} Support`,
      whatsapp: escalationWhatsapp || contactPhone,
      email: contactEmail,
      hours: businessHours || "Business hours configured by brand owner"
    },
    escalationContact: {
      name: `${brandName} Support`,
      whatsapp: escalationWhatsapp || contactPhone,
      email: contactEmail,
      hours: businessHours || "Business hours configured by brand owner"
    },
    policies: {},
    faqs: [],
    widgetConfig: {
      widgetTitle: `${brandName} Help`,
      welcomeTitle: getWelcomeTitle(row),
      welcomeBody: getWelcomeBody(row),
      inputPlaceholder: getInputPlaceholder(row),
      themeColor: row.theme_color || "#0f172a",
      position: "bottom-right",
      quickReplies: getQuickReplies(row)
    },
    escalationRules: {
      hardKeywords: [
        "fraud",
        "scam",
        "legal",
        "police",
        "consumer court",
        "abuse"
      ],
      response: "This needs priority attention. I am routing this to a senior support specialist."
    },
    shopifyStoreUrl: row.shopify_store_url || "",
    shopifyTokenEncrypted: row.shopify_token_encrypted || ""
  };
}

async function getBrandById(brandId) {
  if (!isSafeBrandId(brandId)) return null;

  const encodedId = encodeURIComponent(brandId);
  const { data } = await callSupabaseSafely(
    `Brand lookup for "${brandId}"`,
    `?id=eq.${encodedId}&is_active=eq.true&select=*`
  );
  const row = Array.isArray(data) ? data[0] : null;

  if (!row) return null;

  const validation = validateBrandRow(row);
  if (!validation.valid) {
    console.warn(`[brand] ${brandId} is missing required fields: ${validation.missingFields.join(", ")}`);
    return null;
  }

  return normalizeBrand(row);
}

async function brandExists(brandId) {
  if (!isSafeBrandId(brandId)) return false;

  const encodedId = encodeURIComponent(brandId);
  const { data } = await callSupabaseSafely(
    `Brand existence check for "${brandId}"`,
    `?id=eq.${encodedId}&select=id`
  );
  return Array.isArray(data) && data.length > 0;
}

async function createBrand(brandData) {
  if (!isSafeBrandId(brandData?.id)) {
    const error = new Error("Invalid brand ID.");
    error.statusCode = 400;
    throw error;
  }

  const payload = {
    id: brandData.id,
    brand_name: brandData.brand_name,
    brand_category: brandData.brand_category,
    support_language: brandData.support_language,
    escalation_whatsapp: brandData.escalation_whatsapp || "",
    shopify_store_url: brandData.shopify_store_url || "",
    shopify_token_encrypted: brandData.shopify_token_encrypted || "",
    welcome_title: brandData.welcome_title || null,
    welcome_body: brandData.welcome_body || null,
    quick_replies: brandData.quick_replies || [],
    input_placeholder: brandData.input_placeholder || null,
    contact_phone: brandData.contact_phone || null,
    contact_email: brandData.contact_email || null,
    business_hours: brandData.business_hours || null,
    theme_color: brandData.theme_color || null,
    is_active: brandData.is_active !== false
  };

  const { data } = await callSupabaseSafely(`Brand creation for "${brandData.id}"`, "", {
    method: "POST",
    headers: {
      Prefer: "return=representation"
    },
    body: JSON.stringify(payload)
  });

  return normalizeBrand(Array.isArray(data) ? data[0] : data);
}

async function updateBrand(brandId, updates) {
  if (!isSafeBrandId(brandId)) {
    const error = new Error("Invalid brand ID.");
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
