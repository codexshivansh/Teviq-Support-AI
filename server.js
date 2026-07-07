require("dotenv").config();

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const chatRoutes = require("./routes/chat.routes");
const brandConfigRoutes = require("./routes/brand-config.routes");
const knowledgeRoutes = require("./routes/knowledge.routes");
const onboardingRoutes = require("./routes/onboarding.routes");
const shopifyRoutes = require("./routes/shopify.routes");
const { corsOptions } = require("./config/cors");
const { getNodeEnv, validateEnv } = require("./config/env");
const { requireClerkAuth } = require("./middleware/clerkAuth.middleware");

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

app.use("/api/brand-config", brandConfigRoutes);
app.use("/api/knowledge", requireClerkAuth, knowledgeRoutes);
app.use("/api/integrations/shopify", requireClerkAuth, shopifyRoutes);
app.use("/api/onboarding", requireClerkAuth, onboardingRoutes);
app.use("/api/chat", chatRateLimit, chatRoutes);

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

  console.error("Unhandled error:", error);
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
