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
const analyticsRoutes = require("./routes/analytics.routes");
const conversationsRoutes = require("./routes/conversations.routes");
const internalRoutes = require("./routes/internal.routes");
const { corsOptions } = require("./config/cors");
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
app.use(cors(corsOptions));
app.options("*", cors(corsOptions));
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
    const vectorStore = require("./knowledge/vectorStore.service");

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
      return res.status(response.status).json({
        ok: false,
        supabase: "error",
        status: response.status,
        message: data?.message || "Supabase request failed",
        details: data
      });
    }

    res.json({
      ok: true,
      supabase: "connected",
      message: "Supabase connectivity verified"
    });
  } catch (error) {
    console.error("[Supabase Health Check Error]", error.message);
    res.status(503).json({
      ok: false,
      supabase: "error",
      message: error.message
    });
  }
});

app.use("/api/brand-config", brandConfigRoutes);
app.use("/api/brands", requireClerkAuth, brandsRoutes);
app.use("/api/knowledge", requireClerkAuth, knowledgeRoutes);
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

  if (error.statusCode || error.code === "LIMIT_FILE_SIZE") {
    return res.status(error.statusCode || 400).json({
      error: error.code === "LIMIT_FILE_SIZE" ? "file_too_large" : "request_error",
      message:
        error.code === "LIMIT_FILE_SIZE"
          ? "Document is too large. Maximum upload size is 10MB."
          : error.message
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
      message: error.message || "Failed to access knowledge store. Please try again."
    });
  }

  console.error("Unhandled error:", {
    message: error.message,
    code: error.code,
    context: error.context,
    stack: error.stack
  });

  res.status(500).json({
    reply: "Sorry, support is temporarily unavailable. Please try again in a few minutes.",
    source: "system",
    escalated: false,
    intent: "general"
  });
});

const server = app.listen(PORT, () => {
  console.log(`Teviq Support AI backend running on port ${PORT}`);
});

server.ref();

module.exports = { app, server };
