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

function isPublicWidgetRequest(req) {
  const path = String(req?.path || req?.originalUrl || "").split("?")[0];
  return path === "/api/chat" || path === "/api/chat/" || path.startsWith("/api/brand-config/");
}

function getCorsAllowedOrigins() {
  return Array.from(new Set([...DEFAULT_ALLOWED_ORIGINS, ...getAllowedOrigins()]));
}

function isAllowedOrigin(origin) {
  if (!origin) return true;

  return getCorsAllowedOrigins().includes(origin) || VERCEL_PREVIEW_ORIGIN_PATTERN.test(origin);
}

function corsOrigin(origin, callback) {
  if (!isProduction()) {
    return callback(null, true);
  }

  if (isAllowedOrigin(origin)) {
    return callback(null, true);
  }

  return callback(new Error("Origin is not allowed by CORS"));
}

const corsOptions = {
  origin: corsOrigin,
  credentials: true,
  methods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Authorization", "Content-Type", "X-Requested-With", "x-teviq-demo-auth", "x-debug-secret"],
  optionsSuccessStatus: 204
};

const publicWidgetCorsOptions = {
  // Widget APIs already use public brand identifiers and never accept Clerk
  // credentials. Reflecting the storefront origin lets a brand embed Teviq
  // without weakening the protected dashboard API allowlist.
  origin: true,
  credentials: false,
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type", "X-Requested-With"],
  optionsSuccessStatus: 204
};

function corsOptionsDelegate(req, callback) {
  callback(null, isPublicWidgetRequest(req) ? publicWidgetCorsOptions : corsOptions);
}

module.exports = {
  corsOrigin,
  corsOptions,
  corsOptionsDelegate,
  getCorsAllowedOrigins,
  isAllowedOrigin,
  isPublicWidgetRequest,
  publicWidgetCorsOptions
};
