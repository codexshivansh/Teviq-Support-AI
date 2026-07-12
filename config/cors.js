const { getAllowedOrigins, isProduction } = require("./env");

const DEFAULT_ALLOWED_ORIGINS = [
  "https://teviq-support-ai-dashboard-ph9p.vercel.app",
  "https://dashboard.teviq.in",
  "https://teviq.in",
  "https://www.teviq.in",
  "http://localhost:5173",
  "http://localhost:3000"
];

const VERCEL_PREVIEW_ORIGIN_PATTERN = /^https:\/\/[a-z0-9-]+\.vercel\.app$/i;

function getCorsAllowedOrigins() {
  return Array.from(new Set([...DEFAULT_ALLOWED_ORIGINS, ...getAllowedOrigins()]));
}

function isAllowedOrigin(origin) {
  if (!origin) return true;

  return getCorsAllowedOrigins().includes(origin) || VERCEL_PREVIEW_ORIGIN_PATTERN.test(origin);
}

function corsOrigin(origin, callback) {
  if (isAllowedOrigin(origin)) {
    return callback(null, true);
  }

  if (!isProduction()) {
    return callback(new Error(`Origin is not allowed by CORS: ${origin || "unknown"}`));
  }

  return callback(new Error("Origin is not allowed by CORS"));
}

const corsOptions = {
  origin: corsOrigin,
  credentials: true,
  methods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Authorization", "Content-Type", "X-Requested-With", "x-teviq-demo-auth"],
  optionsSuccessStatus: 204
};

module.exports = { corsOrigin, corsOptions, getCorsAllowedOrigins, isAllowedOrigin };
