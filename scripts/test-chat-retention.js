const assert = require("assert");

async function run() {
  const originalFetch = global.fetch;
  const originalUrl = process.env.SUPABASE_URL;
  const originalKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const originalDays = process.env.CHAT_RETENTION_DAYS;
  let capturedRequest = null;

  process.env.SUPABASE_URL = "https://project.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key";
  process.env.CHAT_RETENTION_DAYS = "30";
  global.fetch = async (url, options) => {
    capturedRequest = { url: String(url), options };
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify([{ id: "old-log-1" }, { id: "old-log-2" }])
    };
  };

  try {
    const retentionPath = require.resolve("../services/chatRetention.service");
    delete require.cache[retentionPath];
    const { deleteExpiredChatLogs, getRetentionDays } = require(retentionPath);

    assert.equal(getRetentionDays("invalid"), 30);
    assert.equal(getRetentionDays("0"), 1);
    assert.equal(getRetentionDays("99999"), 3650);

    const result = await deleteExpiredChatLogs({
      now: new Date("2026-07-22T00:00:00.000Z")
    });

    assert.equal(result.retentionDays, 30);
    assert.equal(result.cutoffIso, "2026-06-22T00:00:00.000Z");
    assert.equal(result.deletedCount, 2);
    assert.equal(capturedRequest.options.method, "DELETE");
    assert.ok(capturedRequest.url.includes("/rest/v1/chat_logs?created_at=lt."));
    assert.ok(capturedRequest.url.includes(encodeURIComponent(result.cutoffIso)));
    assert.equal(capturedRequest.options.headers.Prefer, "return=representation");
    assert.equal(capturedRequest.options.headers.Authorization, "Bearer test-service-role-key");

    console.log("PASS retention uses a server-side 30-day cutoff");
    console.log("PASS expired chat deletion uses the service-role REST request");
    console.log("PASS retention configuration is bounded safely");
  } finally {
    global.fetch = originalFetch;
    if (originalUrl === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = originalUrl;
    if (originalKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = originalKey;
    if (originalDays === undefined) delete process.env.CHAT_RETENTION_DAYS;
    else process.env.CHAT_RETENTION_DAYS = originalDays;
  }
}

run().catch((error) => {
  console.error(`FAIL ${error.stack || error.message}`);
  process.exitCode = 1;
});
