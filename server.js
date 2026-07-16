require("dotenv").config();

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const chatRoutes = require("./routes/chat.routes");
const brandConfigRoutes = require("./routes/brand-config.routes");
const brandsRoutes = require("./routes/brands.routes");
const knowledgeRoutes = require("./routes/knowledge.routes");
const onboardingRoutes = require("./routes/onboarding.routes");
const shopifyRoutes = require("./routes/shopify.routes");
const shopifyPublicRoutes = require("./routes/shopify-public.routes");
const shopifyWebhookRoutes = require("./routes/shopify-webhook.routes");
const analyticsRoutes = require("./routes/analytics.routes");
const conversationsRoutes = require("./routes/conversations.routes");
const internalRoutes = require("./routes/internal.routes");
const meRoutes = require("./routes/me.routes");
const { corsOptionsDelegate } = require("./config/cors");
const { getNodeEnv, validateEnv } = require("./config/env");
const { requireClerkAuth } = require("./middleware/clerkAuth.middleware");
const { requireInternalCronSecret } = require("./middleware/internalCron.middleware");

const app = express();
const PORT = Number(process.env.PORT) || 5000;
const NODE_ENV = getNodeEnv();

validateEnv();

app.set("trust proxy", 1);
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" }
  })
);
app.use(cors(corsOptionsDelegate));
app.options("*", cors(corsOptionsDelegate));
app.use("/api/integrations/shopify", shopifyWebhookRoutes);
app.use(express.json({ limit: "1mb" }));

const chatRateLimit = rateLimit({
  windowMs: 60 * 1000,
  limit: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    reply: "Too many messages. Please wait a minute and try again.",
    source: "system",
    escalated: false,
    intent: "general_faq"
  }
});

app.get("/health", (req, res) => {
  res.json({
    ok: true,
    service: "teviq-support-ai-backend",
    environment: NODE_ENV
  });
});

// Diagnostic endpoint to test Supabase connectivity
app.get("/health/supabase", async (req, res) => {
  try {
    // Try a simple query to test connectivity
    const response = await fetch(
      `${process.env.SUPABASE_URL}/rest/v1/knowledge_documents?select=count&limit=1`,
      {
        headers: {
          apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
          "Content-Type": "application/json"
        }
      }
    );

    const data = await response.json();

    if (!response.ok) {
      console.error("[Supabase Health Check Error]", {
        status: response.status,
        code: data?.code || null
      });
      return res.status(response.status >= 500 ? 503 : 502).json({
        ok: false,
        supabase: "unavailable",
        message: "Supabase connectivity check failed."
      });
    }

    res.json({
      ok: true,
      supabase: "connected",
      message: "Supabase connectivity verified"
    });
  } catch (error) {
    console.error("[Supabase Health Check Error]", {
      name: error.name,
      message: error.message
    });
    res.status(503).json({
      ok: false,
      supabase: "unavailable",
      message: "Supabase connectivity check failed."
    });
  }
});

// Diagnostic endpoint - tests the entire knowledge documents pipeline
// without requiring Clerk auth. Useful for debugging deployment issues.
// Guarded by an env-var secret so it can't be freely called in production.
app.get("/health/knowledge/:brandId", async (req, res) => {
  if (NODE_ENV === "production") {
    return res.status(404).json({ error: "not_found", message: "Endpoint not found." });
  }

  const debugSecret = req.query.secret || req.get("x-debug-secret") || "";
  const expectedSecret = String(process.env.DEBUG_SECRET || "").trim();

  if (!expectedSecret) {
    return res.status(503).json({ error: "debug_not_configured", message: "Debug access is not configured." });
  }

  if (debugSecret !== expectedSecret) {
    return res.status(403).json({ error: "forbidden", message: "Debug secret required." });
  }

  const results = {
    brandId: req.params.brandId,
    steps: []
  };

  try {
    // Step 1: Look up brand
    results.steps.push({ step: "brand_lookup", status: "starting" });
    const { getBrandById } = require("./services/brand.service");
    const brand = await getBrandById(req.params.brandId);
    results.steps[results.steps.length - 1].status = "ok";
    results.steps[results.steps.length - 1].brand = brand ? { id: brand.brandId, name: brand.brandName } : null;

    if (!brand) {
      return res.json({ ok: false, reason: "brand_not_found", ...results });
    }

    // Step 2: List documents
    results.steps.push({ step: "list_documents", status: "starting" });
    const vectorStore = require("./knowledge/vectorStore.service");
    const documents = await vectorStore.listDocuments(brand.brandId);
    results.steps[results.steps.length - 1].status = "ok";
    results.steps[results.steps.length - 1].count = documents.length;

    // Step 3: Get stats
    results.steps.push({ step: "get_stats", status: "starting" });
    const stats = await vectorStore.getStats(brand.brandId);
    results.steps[results.steps.length - 1].status = "ok";
    results.steps[results.steps.length - 1].stats = stats;

    return res.json({
      ok: true,
      brandId: brand.brandId,
      documents,
      stats,
      steps: results.steps
    });
  } catch (error) {
    if (results.steps.length > 0) {
      results.steps[results.steps.length - 1].status = "failed";
      results.steps[results.steps.length - 1].error = {
        message: error.message,
        code: error.code,
        statusCode: error.statusCode,
        supabaseStatus: error.supabaseStatus,
        supabasePath: error.supabasePath,
        supabaseData: error.supabaseData
      };
    }
    console.error("[Debug knowledge] Failed:", error);
    return res.status(500).json({
      ok: false,
      error: {
        message: error.message,
        code: error.code,
        statusCode: error.statusCode,
        supabaseStatus: error.supabaseStatus,
        supabasePath: error.supabasePath,
        stack: error.stack?.split('\n').slice(0, 5)
      },
      ...results
    });
  }
});

app.use("/api/me", requireClerkAuth, meRoutes);
app.use("/api/brand-config", brandConfigRoutes);
app.use("/api/brands", requireClerkAuth, brandsRoutes);
app.use("/api/knowledge", requireClerkAuth, knowledgeRoutes);
app.use("/api/integrations/shopify", shopifyPublicRoutes);
app.use("/api/integrations/shopify", requireClerkAuth, shopifyRoutes);
app.use("/api/onboarding", requireClerkAuth, onboardingRoutes);
app.use("/api/analytics", requireClerkAuth, analyticsRoutes);
app.use("/api/conversations", requireClerkAuth, conversationsRoutes);
app.use("/api/chat", chatRateLimit, chatRoutes);
app.use("/internal", requireInternalCronSecret, internalRoutes);

app.use((req, res) => {
  res.status(404).json({
    reply: "Endpoint not found.",
    source: "system",
    escalated: false,
    intent: "general"
  });
});

app.use((error, req, res, next) => {
  if (error.message === "Origin is not allowed by CORS") {
    return res.status(403).json({
      reply: "This origin is not allowed to use Teviq Support AI.",
      source: "system",
      escalated: false,
      intent: "general_faq"
    });
  }

  if (error.code === "LIMIT_FILE_SIZE") {
    return res.status(400).json({
      error: "file_too_large",
      message: "Document is too large. Maximum upload size is 10MB."
    });
  }

  // Handle Supabase configuration errors
  if (error.code === "supabase_not_configured") {
    console.error("[Supabase Config Error]", error.message);
    return res.status(503).json({
      error: "vector_store_unavailable",
      message: "Knowledge vector store is not configured. Please contact support."
    });
  }

  // Handle Supabase timeout errors
  if (error.code === "supabase_timeout") {
    console.error("[Supabase Timeout]", error.message);
    return res.status(504).json({
      error: "vector_store_timeout",
      message: "Knowledge store request timed out. Please try again."
    });
  }

  // Handle Supabase connection errors
  if (error.supabaseStatus) {
    const status = error.supabaseStatus >= 500 ? 503 : error.supabaseStatus;
    console.error(`[Supabase ${error.supabaseStatus}]`, error.supabasePath, error.message);
    return res.status(status).json({
      error: "vector_store_error",
      message: "Failed to access knowledge store. Please try again."
    });
  }

  if (error.statusCode && error.statusCode < 500) {
    return res.status(error.statusCode).json({
      error: "request_error",
      message: error.message || "The request could not be completed."
    });
  }

  console.error("[Unhandled error]", {
    message: error.message,
    code: error.code,
    context: error.context,
    path: error.supabasePath,
    statusCode: error.statusCode,
    stack: error.stack?.split('\n').slice(0, 3).join('\n')
  });

  const errorMessage =
    NODE_ENV === "production"
      ? "Something went wrong. Please try again."
      : error.message || "An unexpected error occurred.";
  res.status(500).json({
    error: "internal_error",
    message: errorMessage,
    reply: errorMessage,
    source: "system",
    escalated: false,
    intent: "general",
    context: NODE_ENV === "production" ? undefined : error.context || undefined,
    debug: NODE_ENV === "production" ? undefined : {
      code: error.code,
      stack: error.stack?.split('\n').slice(0, 5)
    }
  });
});

const server = app.listen(PORT, () => {
  console.log(`Teviq Support AI backend running on port ${PORT}`);
});

server.ref();

module.exports = { app, server };
