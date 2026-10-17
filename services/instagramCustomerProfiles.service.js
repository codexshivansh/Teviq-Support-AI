const connectionStore = require("../integrations/instagram/instagramConnection.store");
const { decryptValue } = require("./shopifyCredentials.service");

const profiles = new Map();
const CACHE_LIMIT = 500;
const PROFILE_TTL_MS = 60 * 60 * 1000;
const FAILURE_TTL_MS = 60 * 1000;

function remember(key, profile) {
  profiles.delete(key);
  profiles.set(key, { profile, expiresAt: Date.now() + (profile ? PROFILE_TTL_MS : FAILURE_TTL_MS) });
  while (profiles.size > CACHE_LIMIT) profiles.delete(profiles.keys().next().value);
  return profile;
}

async function readProfile({ brandId, accountId, customerId, accessToken, signal }) {
  // Sender IDs are scoped to an Instagram account. Never share a profile cache
  // entry between brands or connected accounts, even if their IDs coincide.
  const key = JSON.stringify([brandId, accountId, customerId]);
  const cached = profiles.get(key);
  if (cached?.expiresAt > Date.now()) return cached.profile;
  if (signal.aborted) return null;

  try {
    const version = process.env.INSTAGRAM_GRAPH_API_VERSION || "v26.0";
    const url = new URL(`https://graph.instagram.com/${version}/${encodeURIComponent(customerId)}`);
    url.searchParams.set("fields", "username,name");
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal
    });
    if (!response.ok) return remember(key, null);
    const body = await response.json();
    const username = typeof body.username === "string" ? body.username.trim().replace(/^@/, "") : "";
    const name = typeof body.name === "string" ? body.name.trim().slice(0, 100) : "";
    const profile = {
      username: /^[a-zA-Z0-9._]{1,30}$/.test(username) ? username : null,
      name: name || null
    };
    return remember(key, profile.username || profile.name ? profile : null);
  } catch {
    // Profile visibility, provider errors, and timeouts must not hide chats.
    return remember(key, null);
  }
}

async function enrichInstagramConversations({ brandId, conversations }) {
  const customerIds = [...new Set(conversations
    .filter((conversation) => conversation.channel === "instagram")
    .map((conversation) => conversation.customerId)
    .filter(Boolean))];
  if (!customerIds.length) return conversations;

  let connection;
  let accessToken;
  try {
    connection = await connectionStore.getConnectionByBrandId(brandId);
    if (connection?.status !== "active") return conversations;
    accessToken = decryptValue(connection.access_token_encrypted);
  } catch {
    return conversations;
  }

  const resolved = new Map();
  // Bound total provider latency and concurrency, including on a large inbox.
  // Further profiles can fill the cache on subsequent inbox loads.
  const signal = AbortSignal.timeout(2500);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(4, customerIds.length) }, async () => {
    while (next < customerIds.length && !signal.aborted) {
      const customerId = customerIds[next++];
      const profile = await readProfile({
        brandId, accountId: connection.instagram_user_id, customerId, accessToken, signal
      });
      if (profile) resolved.set(customerId, profile);
    }
  }));

  return conversations.map((conversation) => {
    const profile = conversation.channel === "instagram" && resolved.get(conversation.customerId);
    if (!profile) return conversation;
    return {
      ...conversation,
      customer: profile.username ? `@${profile.username}` : profile.name,
      customerUsername: profile.username,
      customerName: profile.name
    };
  });
}

module.exports = { enrichInstagramConversations };
