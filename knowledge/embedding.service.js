const MODEL = process.env.GEMINI_EMBEDDING_MODEL || "gemini-embedding-001";
const OUTPUT_DIMENSIONALITY = 768;
const MAX_BATCH_SIZE = 100;
const MAX_RETRIES = 2;
const RETRY_BASE_DELAY_MS = 500;

function getApiKey() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    const error = new Error("GEMINI_API_KEY is not configured. Embedding calls cannot run.");
    error.code = "gemini_api_key_missing";
    throw error;
  }
  return apiKey;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableStatus(status) {
  return status === 429 || (status >= 500 && status < 600);
}

async function requestWithRetry(url, body, label) {
  let lastError;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
    let response;
    try {
      response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
    } catch (networkError) {
      lastError = networkError;
      if (attempt < MAX_RETRIES) {
        const delay = RETRY_BASE_DELAY_MS * 2 ** attempt;
        console.warn(
          `[embedding] ${label} network error (${networkError.message}), retrying in ${delay}ms (attempt ${attempt + 1}/${MAX_RETRIES + 1})`
        );
        await sleep(delay);
        continue;
      }
      throw networkError;
    }

    const responseText = await response.text();
    const data = responseText ? JSON.parse(responseText) : null;

    if (response.ok) {
      return data;
    }

    const error = new Error(data?.error?.message || `${label} failed with HTTP ${response.status}`);
    error.statusCode = response.status;

    if (isRetryableStatus(response.status) && attempt < MAX_RETRIES) {
      lastError = error;
      const delay = RETRY_BASE_DELAY_MS * 2 ** attempt;
      console.warn(
        `[embedding] ${label} got HTTP ${response.status}, retrying in ${delay}ms (attempt ${attempt + 1}/${MAX_RETRIES + 1})`
      );
      await sleep(delay);
      continue;
    }

    throw error;
  }

  throw lastError;
}

async function embedForStorage(text) {
  const apiKey = getApiKey();
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:embedContent?key=${apiKey}`;
  const body = {
    model: `models/${MODEL}`,
    content: { parts: [{ text }] },
    output_dimensionality: OUTPUT_DIMENSIONALITY,
    task_type: "RETRIEVAL_DOCUMENT"
  };

  const data = await requestWithRetry(url, body, "embedForStorage");
  const values = data?.embedding?.values;

  if (!Array.isArray(values)) {
    throw new Error("Gemini embedding response did not contain embedding.values");
  }

  return values;
}

async function embedForQuery(text) {
  const apiKey = getApiKey();
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:embedContent?key=${apiKey}`;
  const body = {
    model: `models/${MODEL}`,
    content: { parts: [{ text }] },
    output_dimensionality: OUTPUT_DIMENSIONALITY,
    task_type: "RETRIEVAL_QUERY"
  };

  const data = await requestWithRetry(url, body, "embedForQuery");
  const values = data?.embedding?.values;

  if (!Array.isArray(values)) {
    throw new Error("Gemini embedding response did not contain embedding.values");
  }

  return values;
}

async function embedBatchForStorage(texts) {
  const apiKey = getApiKey();
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:batchEmbedContents?key=${apiKey}`;

  const allValues = [];

  for (let start = 0; start < texts.length; start += MAX_BATCH_SIZE) {
    const batchTexts = texts.slice(start, start + MAX_BATCH_SIZE);
    const body = {
      requests: batchTexts.map((text) => ({
        model: `models/${MODEL}`,
        content: { parts: [{ text }] },
        output_dimensionality: OUTPUT_DIMENSIONALITY,
        task_type: "RETRIEVAL_DOCUMENT"
      }))
    };

    const data = await requestWithRetry(url, body, "embedBatchForStorage");
    const embeddings = data?.embeddings;

    if (!Array.isArray(embeddings) || embeddings.length !== batchTexts.length) {
      throw new Error("Gemini batch embedding response did not contain the expected embeddings array");
    }

    allValues.push(...embeddings.map((item) => item.values));
  }

  return allValues;
}

function cosineSimilarity(left, right) {
  if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) {
    return 0;
  }

  let dot = 0;
  let magLeft = 0;
  let magRight = 0;

  for (let i = 0; i < left.length; i += 1) {
    dot += left[i] * right[i];
    magLeft += left[i] * left[i];
    magRight += right[i] * right[i];
  }

  const magnitude = Math.sqrt(magLeft) * Math.sqrt(magRight);
  return magnitude ? dot / magnitude : 0;
}

module.exports = {
  MODEL,
  OUTPUT_DIMENSIONALITY,
  embedForStorage,
  embedForQuery,
  embedBatchForStorage,
  cosineSimilarity
};
