const { verifyToken } = require("@clerk/backend");
const { getNodeEnv } = require("../config/env");

function isDemoAuthAllowed() {
  return getNodeEnv() !== "production" && process.env.ENABLE_DEMO_LOGIN !== "false";
}

async function requireClerkAuth(req, res, next) {
  if (isDemoAuthAllowed() && req.get("x-teviq-demo-auth") === "true") {
    req.auth = {
      userId: "demo_urban_user",
      sessionType: "demo",
      brandId: "urban-demo"
    };
    return next();
  }

  const authHeader = req.get("authorization") || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";

  if (!token) {
    return res.status(401).json({
      error: "unauthorized",
      message: "Authentication is required."
    });
  }

  if (!process.env.CLERK_SECRET_KEY) {
    return res.status(503).json({
      error: "auth_not_configured",
      message: "Dashboard authentication is not configured."
    });
  }

  try {
    const payload = await verifyToken(token, {
      secretKey: process.env.CLERK_SECRET_KEY
    });

    req.auth = {
      userId: payload.sub,
      sessionId: payload.sid,
      sessionType: "clerk",
      claims: payload
    };
    return next();
  } catch (error) {
    return res.status(401).json({
      error: "invalid_token",
      message: "Invalid or expired authentication token."
    });
  }
}

module.exports = {
  requireClerkAuth,
  isDemoAuthAllowed
};
