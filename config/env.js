function getNodeEnv() {
  return process.env.NODE_ENV || "development";
}

function isProduction() {
  return getNodeEnv() === "production";
}

function getAllowedOrigins() {
  return Array.from(new Set((process.env.ALLOWED_ORIGINS || "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean)));
}

function validateEnv() {
  if (!process.env.GEMINI_API_KEY) {
    console.warn("[env] GEMINI_API_KEY is missing. Gemini calls will be skipped.");
  }

  if (!process.env.GROQ_API_KEY) {
    console.warn("[env] GROQ_API_KEY is missing. Groq fallback calls will be skipped.");
  }

  if (isProduction() && getAllowedOrigins().length === 0) {
    console.warn(
      "[env] ALLOWED_ORIGINS is missing in production. Browser requests will be blocked by CORS."
    );
  }

  if (isProduction() && !process.env.CLERK_SECRET_KEY) {
    console.warn(
      "[env] CLERK_SECRET_KEY is missing in production. Protected dashboard APIs will reject requests."
    );
  }

  if (!process.env.SUPABASE_URL) {
    console.warn("[env] SUPABASE_URL is missing. Brand lookup will be unavailable.");
  }

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.warn("[env] SUPABASE_SERVICE_ROLE_KEY is missing. Brand lookup will be unavailable.");
  }

  if (
    process.env.CHAT_RETENTION_DAYS &&
    (!Number.isInteger(Number(process.env.CHAT_RETENTION_DAYS)) || Number(process.env.CHAT_RETENTION_DAYS) < 1)
  ) {
    console.warn("[env] CHAT_RETENTION_DAYS is invalid. The 30-day default will be used.");
  }

  if (isProduction() && (!process.env.SHOPIFY_CLIENT_ID || !process.env.SHOPIFY_CLIENT_SECRET)) {
    console.warn(
      "[env] SHOPIFY_CLIENT_ID or SHOPIFY_CLIENT_SECRET is missing. Shopify OAuth connections will be unavailable."
    );
  }

  if (isProduction() && !process.env.SHOPIFY_CREDENTIALS_SECRET) {
    console.warn(
      "[env] SHOPIFY_CREDENTIALS_SECRET is missing. Configure a dedicated encryption secret before connecting stores."
    );
  }

  if (!isProduction() && process.env.ENABLE_DEMO_LOGIN !== "false") {
    console.warn("[env] Demo login bypass is enabled for non-production dashboard presentations.");
  }
}

module.exports = { getNodeEnv, isProduction, getAllowedOrigins, validateEnv };
