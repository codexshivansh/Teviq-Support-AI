const crypto = require("crypto");
const { encryptValue } = require("./shopifyCredentials.service");

function getSupabaseConfig() {
  const url = String(process.env.SUPABASE_URL || "").replace(/\/$/, "");
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

  if (!url || !serviceRoleKey) {
    const error = new Error("Supabase lead store is not configured.");
    error.statusCode = 503;
    error.code = "lead_store_not_configured";
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

function createId() {
  return `lead_${Date.now()}_${crypto.randomBytes(6).toString("hex")}`;
}

function getContactType(email, phone) {
  if (email && phone) return "email_and_phone";
  return email ? "email" : "phone";
}

async function createLeadRecord({
  brandId,
  customerId,
  channel = "widget",
  intent,
  name = null,
  email = null,
  phone = null
}) {
  if (!brandId || !customerId || !["human_support", "business_enquiry"].includes(intent)) {
    const error = new Error("Lead record is missing required fields.");
    error.statusCode = 400;
    error.code = "invalid_lead_record";
    throw error;
  }

  if (!email && !phone) {
    const error = new Error("Lead contact information is required.");
    error.statusCode = 400;
    error.code = "missing_lead_contact";
    throw error;
  }

  const contactEncrypted = {};
  if (email) contactEncrypted.email = encryptValue(String(email).trim().toLowerCase());
  if (phone) contactEncrypted.phone = encryptValue(String(phone).trim());

  const row = {
    id: createId(),
    brand_id: String(brandId).slice(0, 120),
    customer_id: String(customerId).slice(0, 200),
    channel: String(channel || "widget").slice(0, 40),
    intent,
    name_encrypted: name ? encryptValue(String(name).trim().slice(0, 100)) : null,
    contact_type: getContactType(email, phone),
    contact_encrypted: contactEncrypted,
    status: "new"
  };

  const { url } = getSupabaseConfig();
  const response = await fetch(`${url}/rest/v1/leads`, {
    method: "POST",
    headers: getHeaders({ Prefer: "return=minimal" }),
    body: JSON.stringify(row)
  });

  if (!response.ok) {
    const error = new Error(`Lead store request failed with ${response.status}.`);
    error.statusCode = response.status;
    error.code = "lead_store_error";
    throw error;
  }

  return { id: row.id, brandId: row.brand_id, status: row.status };
}

module.exports = { createLeadRecord };
