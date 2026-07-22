const DEFAULT_RETENTION_DAYS = 30;
const MIN_RETENTION_DAYS = 1;
const MAX_RETENTION_DAYS = 3650;

function getSupabaseConfig() {
  const url = String(process.env.SUPABASE_URL || "").replace(/\/$/, "");
  const serviceRoleKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY || "");

  if (!url || !serviceRoleKey) {
    const error = new Error("Supabase chat retention is not configured.");
    error.statusCode = 503;
    error.code = "supabase_not_configured";
    throw error;
  }

  return { url, serviceRoleKey };
}

function getRetentionDays(value = process.env.CHAT_RETENTION_DAYS) {
  const parsed = Number.parseInt(String(value || DEFAULT_RETENTION_DAYS), 10);
  if (!Number.isFinite(parsed)) return DEFAULT_RETENTION_DAYS;
  return Math.min(MAX_RETENTION_DAYS, Math.max(MIN_RETENTION_DAYS, parsed));
}

async function deleteExpiredChatLogs({ now = new Date(), retentionDays = getRetentionDays() } = {}) {
  const { url, serviceRoleKey } = getSupabaseConfig();
  const safeRetentionDays = getRetentionDays(retentionDays);
  const cutoffIso = new Date(
    now.getTime() - safeRetentionDays * 24 * 60 * 60 * 1000
  ).toISOString();
  const filter = `created_at=lt.${encodeURIComponent(cutoffIso)}&select=id`;
  const response = await fetch(`${url}/rest/v1/chat_logs?${filter}`, {
    method: "DELETE",
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json",
      Prefer: "return=representation"
    }
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : [];

  if (!response.ok) {
    const error = new Error(data?.message || `Chat retention cleanup failed with ${response.status}`);
    error.statusCode = response.status;
    error.code = "chat_retention_failed";
    throw error;
  }

  return {
    retentionDays: safeRetentionDays,
    cutoffIso,
    deletedCount: Array.isArray(data) ? data.length : 0
  };
}

module.exports = {
  DEFAULT_RETENTION_DAYS,
  getRetentionDays,
  deleteExpiredChatLogs
};
