const { encryptValue, decryptValue } = require("../../services/shopifyCredentials.service");
const connectionStore = require("./instagramConnection.store");

const REFRESH_WINDOW_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

async function refreshToken(accessToken) {
  const url = new URL("https://graph.instagram.com/refresh_access_token");
  url.searchParams.set("grant_type", "ig_refresh_token");
  url.searchParams.set("access_token", accessToken);
  const response = await fetch(url);
  const body = await response.json().catch(() => null);
  if (!response.ok || !body?.access_token || !Number.isFinite(Number(body.expires_in))) {
    const error = new Error(body?.error?.message || "Instagram token refresh failed.");
    error.statusCode = response.status >= 500 ? 502 : 400;
    error.code = "instagram_token_refresh_failed";
    throw error;
  }
  return body;
}

async function refreshExpiringTokens({ now = new Date(), withinDays = REFRESH_WINDOW_DAYS } = {}) {
  const cutoff = new Date(now.getTime() + withinDays * DAY_MS).toISOString();
  const connections = await connectionStore.listConnectionsExpiringBefore(cutoff);
  const results = { checked: connections.length, refreshed: 0, skippedTooNew: 0, expired: 0, failed: 0 };

  for (const connection of connections) {
    const expiresAt = new Date(connection.token_expires_at).getTime();
    if (!Number.isFinite(expiresAt) || expiresAt <= now.getTime()) {
      results.expired += 1;
      await connectionStore.updateConnection(connection.brand_id, {
        status: "error",
        last_token_refresh_error: "Instagram token expired; reconnect the account."
      });
      continue;
    }

    const issuedAt = new Date(connection.token_issued_at || connection.connected_at).getTime();
    if (!Number.isFinite(issuedAt) || now.getTime() - issuedAt < DAY_MS) {
      results.skippedTooNew += 1;
      continue;
    }

    try {
      const tokenData = await refreshToken(decryptValue(connection.access_token_encrypted));
      const updatedAt = new Date(now.getTime()).toISOString();
      await connectionStore.updateConnection(connection.brand_id, {
        access_token_encrypted: JSON.stringify(encryptValue(tokenData.access_token)),
        token_issued_at: updatedAt,
        token_expires_at: new Date(now.getTime() + Number(tokenData.expires_in) * 1000).toISOString(),
        last_token_refresh_at: updatedAt,
        last_token_refresh_error: null,
        status: "active"
      });
      results.refreshed += 1;
    } catch (error) {
      results.failed += 1;
      await connectionStore.updateConnection(connection.brand_id, {
        last_token_refresh_error: String(error.message || "Instagram token refresh failed.").slice(0, 500)
      }).catch(() => {});
      console.error("[instagram-token-refresh] Refresh failed", {
        brandId: connection.brand_id,
        code: error.code,
        message: error.message
      });
    }
  }

  return results;
}

module.exports = { REFRESH_WINDOW_DAYS, refreshExpiringTokens };
