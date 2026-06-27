const baseUrl = process.env.SMOKE_TEST_URL || "http://localhost:5000";

async function requestJson(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });
  const data = await response.json().catch(() => null);

  if (!response.ok) {
    const error = new Error(`HTTP ${response.status}`);
    error.response = { data };
    throw error;
  }

  return { data };
}

async function check(name, fn) {
  try {
    await fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    const detail = error.response?.data || error.message;
    console.error(`FAIL ${name}`, detail);
    process.exitCode = 1;
  }
}

async function run() {
  await check("/health", async () => {
    const response = await requestJson(`${baseUrl}/health`);
    if (!response.data?.ok) {
      throw new Error("Health check did not return ok=true");
    }
  });

  for (const brandId of ["vastra-demo", "urban-demo", "beauty-demo"]) {
    await check(`/api/brand-config/${brandId}`, async () => {
      const response = await requestJson(`${baseUrl}/api/brand-config/${brandId}`);
      if (!response.data?.brandName || !response.data?.quickReplies?.length) {
        throw new Error(`Brand config did not return public widget config for ${brandId}`);
      }
    });
  }

  await check("/api/chat FAQ", async () => {
    const response = await requestJson(
      `${baseUrl}/api/chat`,
      {
        method: "POST",
        body: JSON.stringify({
          brandId: "vastra-demo",
          message: "Do you have COD?",
          customerId: "smoke_test_guest"
        })
      }
    );

    if (!response.data?.reply || response.data?.intent !== "payment_cod") {
      throw new Error("Chat FAQ smoke test returned unexpected response");
    }
  });

  await check("/api/chat multi-brand FAQ", async () => {
    const response = await requestJson(
      `${baseUrl}/api/chat`,
      {
        method: "POST",
        body: JSON.stringify({
          brandId: "urban-demo",
          message: "Do products have warranty?",
          customerId: "smoke_test_guest"
        })
      }
    );

    if (!response.data?.reply || response.data?.intent !== "general_faq") {
      throw new Error("Multi-brand chat smoke test returned unexpected response");
    }
  });
}

run();
