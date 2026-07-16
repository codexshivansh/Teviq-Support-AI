const assert = require("assert");
const { spawn } = require("child_process");
const path = require("path");

const backendDir = path.join(__dirname, "..");
const port = 5197;

function waitForServer(child) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("Production test server did not start.")), 10000);

    child.stdout.on("data", (chunk) => {
      if (String(chunk).includes("backend running")) {
        clearTimeout(timeout);
        resolve();
      }
    });
    child.once("exit", (code) => {
      clearTimeout(timeout);
      reject(new Error(`Production test server exited early with code ${code}.`));
    });
  });
}

async function testSanitizedProductionErrors() {
  const child = spawn(process.execPath, ["server.js"], {
    cwd: backendDir,
    env: {
      ...process.env,
      NODE_ENV: "production",
      PORT: String(port),
      SUPABASE_URL: "http://127.0.0.1:1",
      SUPABASE_SERVICE_ROLE_KEY: "test-service-role-key",
      ALLOWED_ORIGINS: "http://localhost:3000"
    },
    stdio: ["ignore", "pipe", "pipe"]
  });

  try {
    await waitForServer(child);

    const healthResponse = await fetch(`http://127.0.0.1:${port}/health/supabase`);
    const healthBody = await healthResponse.json();
    assert.equal(healthResponse.status, 503);
    assert.equal(healthBody.message, "Supabase connectivity check failed.");
    assert.equal(JSON.stringify(healthBody).includes("fetch failed"), false);

    const configResponse = await fetch(`http://127.0.0.1:${port}/api/brand-config/test-brand`);
    const configBody = await configResponse.json();
    assert.equal(configResponse.status, 500);
    assert.equal(configBody.message, "Something went wrong. Please try again.");
    assert.equal(configBody.reply, "Something went wrong. Please try again.");
    assert.equal("context" in configBody, false);
    assert.equal("debug" in configBody, false);
  } finally {
    child.kill("SIGTERM");
  }
}

async function testInactiveBrandBlocking() {
  const originalFetch = global.fetch;
  const originalSupabaseUrl = process.env.SUPABASE_URL;
  const originalServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key";

  global.fetch = async (url) => {
    const isInactive = String(url).includes("inactive-brand");
    return {
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify([
          {
            id: isInactive ? "inactive-brand" : "widget-fallback",
            brand_name: isInactive ? "Inactive Brand" : "Widget Fallback",
            brand_category: "Fashion",
            support_language: "english",
            is_active: !isInactive,
            quick_replies: []
          }
        ])
    };
  };

  try {
    const brandServicePath = require.resolve("../services/brand.service");
    delete require.cache[brandServicePath];
    const brandService = require(brandServicePath);
    assert.equal(await brandService.getPublicBrandConfig("inactive-brand"), null);
    const publicConfig = await brandService.getPublicBrandConfig("widget-fallback");
    assert.equal(publicConfig.quickReplies.length, 4);

    require.cache[brandServicePath].exports = {
      getBrandById: async () => ({
        brandId: "inactive-brand",
        brandName: "Inactive Brand",
        isActive: false
      })
    };

    const supportBrainPath = require.resolve("../brain/supportBrain");
    delete require.cache[supportBrainPath];
    const { processMessage } = require(supportBrainPath);
    const result = await processMessage({
      brandId: "inactive-brand",
      customerId: "guest_test",
      message: "Hello"
    });

    assert.equal(result.statusCode, 403);
    assert.deepEqual(result.warnings, ["brand_unavailable"]);
  } finally {
    global.fetch = originalFetch;
    if (originalSupabaseUrl === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = originalSupabaseUrl;
    if (originalServiceRoleKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = originalServiceRoleKey;
  }
}

function callCorsOrigin(corsOrigin, origin) {
  return new Promise((resolve) => {
    corsOrigin(origin, (error, allowed) => resolve({ error, allowed }));
  });
}

async function testCorsModes() {
  const originalNodeEnv = process.env.NODE_ENV;
  const corsPath = require.resolve("../config/cors");
  const envPath = require.resolve("../config/env");

  try {
    process.env.NODE_ENV = "development";
    delete require.cache[corsPath];
    delete require.cache[envPath];
    let result = await callCorsOrigin(require(corsPath).corsOrigin, "http://localhost:5175");
    assert.equal(result.error, null);
    assert.equal(result.allowed, true);

    process.env.NODE_ENV = "production";
    delete require.cache[corsPath];
    delete require.cache[envPath];
    const productionCorsOrigin = require(corsPath).corsOrigin;

    result = await callCorsOrigin(productionCorsOrigin, "https://dashboard.teviq.in");
    assert.equal(result.error, null);
    assert.equal(result.allowed, true);

    result = await callCorsOrigin(productionCorsOrigin, "https://unknown.example");
    assert.ok(result.error);
  } finally {
    if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = originalNodeEnv;
    delete require.cache[corsPath];
    delete require.cache[envPath];
  }
}

async function run() {
  await testSanitizedProductionErrors();
  console.log("PASS production errors are sanitized");

  await testInactiveBrandBlocking();
  console.log("PASS inactive brands are blocked and widget defaults are preserved");

  await testCorsModes();
  console.log("PASS development and production CORS modes");
}

run().catch((error) => {
  console.error(`FAIL ${error.stack || error.message}`);
  process.exitCode = 1;
});
