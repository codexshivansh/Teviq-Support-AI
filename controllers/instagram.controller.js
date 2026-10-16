const connectionStore = require("../integrations/instagram/instagramConnection.store");
const instagramOAuthService = require("../integrations/instagram/instagramOAuth.service");
const { decryptValue } = require("../services/shopifyCredentials.service");
const { sendInstagramMessage } = require("../services/instagram.service");
const { appendChatLog } = require("../services/analytics.service");
const { getBrandOrRespond } = require("./helpers/brandLookup");

function requireInteractiveClerkSession(req, res) {
  // Connecting or disconnecting a third-party account is never allowed from
  // the local demo session, even in non-production environments.
  if (req.auth?.sessionType !== "clerk") {
    res.status(401).json({
      error: "real_session_required",
      message: "Sign in with your Teviq account before connecting Instagram."
    });
    return false;
  }
  return true;
}

async function getStatus(req, res) {
  const brand = await getBrandOrRespond(req, res);
  if (!brand) return;
  const connection = await connectionStore.getConnectionByBrandId(brand.brandId);
  return res.json({
    provider: "instagram",
    brandId: brand.brandId,
    connected: connection?.status === "active",
    oauthConfigured: instagramOAuthService.isInstagramOauthConfigured(),
    connection: connectionStore.toPublicConnection(connection)
  });
}

async function connect(req, res) {
  if (!requireInteractiveClerkSession(req, res)) return;
  const brand = await getBrandOrRespond(req, res);
  if (!brand) return;
  if (!brand.isActive) {
    return res.status(403).json({ error: "brand_inactive", message: "This brand workspace is not active." });
  }
  const result = await instagramOAuthService.beginOauth({
    brandId: brand.brandId,
    clerkUserId: req.auth.userId,
    returnPath: req.body?.returnPath
  });
  return res.json({ ok: true, ...result });
}

async function disconnect(req, res) {
  if (!requireInteractiveClerkSession(req, res)) return;
  const brand = await getBrandOrRespond(req, res);
  if (!brand) return;
  await connectionStore.deleteConnection(brand.brandId);
  return res.json({ ok: true, connected: false });
}

async function sendManualReply(req, res) {
  if (!requireInteractiveClerkSession(req, res)) return;
  const brand = await getBrandOrRespond(req, res);
  if (!brand) return;
  const customerId = String(req.body?.customerId || "").trim();
  const text = String(req.body?.text || "").trim();
  if (!customerId || !text || text.length > 1000) {
    return res.status(400).json({
      ok: false,
      error: "invalid_request",
      message: "customerId and a message of 1–1000 characters are required."
    });
  }

  const connection = await connectionStore.getConnectionByBrandId(brand.brandId);
  if (!connection || connection.status !== "active") {
    return res.status(404).json({ ok: false, error: "instagram_not_connected", message: "No active Instagram connection was found for this workspace." });
  }

  const supabaseUrl = String(process.env.SUPABASE_URL || "").replace(/\/$/, "");
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  if (!supabaseUrl || !serviceRoleKey) {
    return res.status(503).json({ ok: false, error: "supabase_not_configured", message: "Conversation storage is not configured." });
  }
  const query = new URLSearchParams({
    brand_id: `eq.${brand.brandId}`,
    customer_id: `eq.${customerId}`,
    channel: "eq.instagram",
    select: "message,created_at",
    order: "created_at.desc",
    limit: "20"
  });
  const response = await fetch(`${supabaseUrl}/rest/v1/chat_logs?${query}`, {
    headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` }
  });
  const rows = await response.json().catch(() => []);
  if (!response.ok) {
    const error = new Error("Could not verify the Instagram reply window.");
    error.statusCode = 503;
    error.code = "instagram_reply_window_check_failed";
    throw error;
  }
  const latestCustomerMessage = Array.isArray(rows)
    ? rows.find((row) => typeof row.message === "string" && row.message.trim())
    : null;
  const lastInboundAt = latestCustomerMessage ? new Date(latestCustomerMessage.created_at).getTime() : 0;
  if (!lastInboundAt || !Number.isFinite(lastInboundAt) || Date.now() - lastInboundAt >= 23 * 60 * 60 * 1000) {
    return res.status(422).json({
      ok: false,
      error: "window_expired",
      message: "Instagram's customer reply window is closed. Wait for the customer to message again before replying."
    });
  }

  const accessToken = decryptValue(connection.access_token_encrypted);
  const result = await sendInstagramMessage({
    instagramAccountId: connection.instagram_user_id,
    to: customerId,
    text,
    accessToken
  });

  try {
    await appendChatLog({
      brandId: brand.brandId,
      customerId,
      channel: "instagram",
      message: "",
      reply: text,
      detectedIntent: "human_reply",
      escalated: false,
      source: "human_agent",
      knowledgeCitations: [],
      knowledgeConfidence: 0,
      isFallback: false,
      responseTimeMs: null
    });
  } catch (logError) {
    console.error("[instagram] Manual reply sent but transcript logging failed.", {
      brandId: brand.brandId,
      code: logError.code,
      message: logError.message
    });
  }

  return res.json({ ok: true, messageId: result?.message_id || result?.messageId || null });
}

async function oauthCallback(req, res) {
  try {
    const result = await instagramOAuthService.completeOauth(req.query);
    return res.redirect(303, instagramOAuthService.buildDashboardRedirect(result.returnPath, {
      instagram: "connected"
    }));
  } catch (error) {
    console.error("[instagram-oauth] Callback failed", { code: error.code, message: error.message });
    return res.redirect(303, instagramOAuthService.buildDashboardRedirect(error.returnPath, {
      instagram: "error",
      code: error.code || "instagram_connection_failed"
    }));
  }
}

module.exports = { connect, disconnect, getStatus, oauthCallback, sendManualReply };
