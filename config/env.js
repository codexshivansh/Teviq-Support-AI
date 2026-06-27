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
}

module.exports = { getNodeEnv, isProduction, getAllowedOrigins, validateEnv };
