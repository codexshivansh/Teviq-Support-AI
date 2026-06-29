function getNodeEnv() {
  return process.env.NODE_ENV || "development";
}

function isProduction() {
  return getNodeEnv() === "production";
}

function getAllowedOrigins() {
  return (process.env.ALLOWED_ORIGINS || "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
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

  if (!isProduction() && process.env.ENABLE_DEMO_LOGIN !== "false") {
    console.warn("[env] Demo login bypass is enabled for non-production dashboard presentations.");
  }
}

module.exports = { getNodeEnv, isProduction, getAllowedOrigins, validateEnv };
