const crypto = require("crypto");
const { chunkText } = require("./chunking.service");
const { embedBatchForStorage } = require("./embedding.service");
const vectorStore = require("./vectorStore.service");

const POLICY_TYPES = new Set([
  "return",
  "refund",
  "exchange",
  "shipping",
  "cancellation",
  "warranty",
  "privacy",
  "terms",
  "custom"
]);

function getSupabaseConfig() {
  const url = String(process.env.SUPABASE_URL || "").replace(/\/$/, "");
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

  if (!url || !serviceRoleKey) {
    const error = new Error("Supabase structured knowledge store is not configured.");
    error.statusCode = 503;
    error.code = "supabase_not_configured";
    throw error;
  }

  return { url, serviceRoleKey };
}

function getHeaders(extra = {}) {
  const { serviceRoleKey } = getSupabaseConfig();
  return {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    "Content-Type": "application/json",
    ...extra
  };
}

function getRestUrl(path) {
  const { url } = getSupabaseConfig();
  return `${url}/rest/v1/structured_knowledge${path}`;
}

function encodeFilter(value) {
  return encodeURIComponent(String(value || ""));
}

async function request(path, options = {}) {
  const response = await fetch(getRestUrl(path), {
    ...options,
    headers: getHeaders(options.headers)
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;

  if (!response.ok) {
    const error = new Error(data?.message || `Supabase structured_knowledge request failed with ${response.status}`);
    error.statusCode = response.status;
    error.data = data;
    throw error;
  }

  return data;
}

function toRow(item) {
  return {
    id: item.id,
    brand_id: item.brandId,
    type: item.type,
    source: item.source || "manual",
    question: item.question ?? null,
    answer: item.answer ?? null,
    policy_type: item.policyType ?? null,
    title: item.title ?? null,
    content: item.content ?? null,
    tags: item.tags || [],
    metadata: item.metadata || {},
    created_at: item.createdAt,
    updated_at: item.updatedAt
  };
}

function fromRow(row) {
  const base = {
    id: row.id,
    brandId: row.brand_id,
    type: row.type,
    source: row.source,
    tags: row.tags || [],
    metadata: row.metadata || {},
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };

  if (row.type === "faq") {
    return { ...base, question: row.question, answer: row.answer };
  }

  return { ...base, policyType: row.policy_type, title: row.title, content: row.content };
}

function createId(type) {
  return `${type}_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
}

function normalizeString(value) {
  return String(value || "").trim();
}

function normalizeTags(tags) {
  if (Array.isArray(tags)) {
    return tags.map(normalizeString).filter(Boolean);
  }

  if (typeof tags === "string") {
    return tags.split(",").map(normalizeString).filter(Boolean);
  }

  return [];
}

function normalizePolicyType(policyType) {
  const normalized = normalizeString(policyType).toLowerCase();
  return POLICY_TYPES.has(normalized) ? normalized : "";
}

function validatePolicyInput(input, { partial = false } = {}) {
  const policyType = normalizePolicyType(input.policyType);
  const title = normalizeString(input.title);
  const content = normalizeString(input.content);

  if (!partial || input.policyType !== undefined) {
    if (!policyType) {
      return { error: "invalid_policy_type", message: "Select a valid policy type." };
    }
  }

  if (!partial || input.title !== undefined) {
    if (!title) {
      return { error: "missing_title", message: "Policy title is required." };
    }
  }

  if (!partial || input.content !== undefined) {
    if (!content) {
      return { error: "missing_content", message: "Policy content is required." };
    }
  }

  return null;
}

function validateFaqInput(input, { partial = false } = {}) {
  const question = normalizeString(input.question);
  const answer = normalizeString(input.answer);

  if (!partial || input.question !== undefined) {
    if (!question) {
      return { error: "missing_question", message: "FAQ question is required." };
    }
  }

  if (!partial || input.answer !== undefined) {
    if (!answer) {
      return { error: "missing_answer", message: "FAQ answer is required." };
    }
  }

  return null;
}

function itemMatchesSearch(item, search) {
  const query = normalizeString(search).toLowerCase();
  if (!query) return true;

  const searchableText = [
    item.policyType,
    item.title,
    item.content,
    item.question,
    item.answer,
    ...(Array.isArray(item.tags) ? item.tags : [])
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return searchableText.includes(query);
}

function getStructuredText(item) {
  if (item.type === "faq") {
    return `Q: ${item.question}\nA: ${item.answer}`;
  }

  return [item.title, item.content].filter(Boolean).join("\n\n");
}

function getSourceMetadata(item) {
  const now = item.updatedAt || item.createdAt || new Date().toISOString();
  const title = item.type === "faq" ? item.question : item.title;

  return {
    brandId: item.brandId,
    documentId: item.id,
    sourceName: title,
    title,
    mimeType: "text/plain",
    extension: item.type,
    uploadedAt: now
  };
}

function decorateStructuredChunk(chunk, item) {
  const baseMetadata = {
    ...chunk.metadata,
    source_type: item.type,
    source_id: item.id,
    brand_id: item.brandId,
    sourceType: item.type,
    sourceId: item.id
  };

  const metadata = item.type === "faq"
    ? {
        ...baseMetadata,
        question: item.question
      }
    : {
        ...baseMetadata,
        policy_type: item.policyType,
        policyType: item.policyType,
        title: item.title
      };

  return {
    ...chunk,
    metadata
  };
}

async function indexStructuredItem(item) {
  const chunks = chunkText(getStructuredText(item), getSourceMetadata(item)).map((chunk) =>
    decorateStructuredChunk(chunk, item)
  );
  const embeddingValues = await embedBatchForStorage(chunks.map((chunk) => chunk.text));
  const embeddedChunks = chunks.map((chunk, index) => ({ ...chunk, embedding: embeddingValues[index] }));

  return vectorStore.upsertSourceChunks({
    brandId: item.brandId,
    sourceId: item.id,
    sourceType: item.type,
    chunks: embeddedChunks
  });
}

async function deleteStructuredIndex({ brandId, itemId, type }) {
  return vectorStore.deleteChunksBySource({
    brandId,
    sourceId: itemId,
    sourceType: type
  });
}

async function listItems({ brandId, type, search = "" }) {
  const rows = await request(
    `?brand_id=eq.${encodeFilter(brandId)}&type=eq.${encodeFilter(type)}&select=*&order=updated_at.desc`
  );

  return (Array.isArray(rows) ? rows : [])
    .map(fromRow)
    .filter((item) => itemMatchesSearch(item, search));
}

async function createPolicy({ brandId, policyType, title, content, tags }) {
  const validationError = validatePolicyInput({ policyType, title, content });
  if (validationError) return { error: validationError };

  const now = new Date().toISOString();
  const policy = {
    id: createId("policy"),
    brandId,
    type: "policy",
    source: "manual",
    policyType: normalizePolicyType(policyType),
    title: normalizeString(title),
    content: normalizeString(content),
    tags: normalizeTags(tags),
    metadata: {
      sourceType: "manual",
      futureSources: ["shopify_policy_sync", "website_scraping", "notion_import"]
    },
    createdAt: now,
    updatedAt: now
  };

  try {
    await indexStructuredItem(policy);
  } catch (error) {
    console.error(
      `[structuredKnowledge] Failed to index policy "${policy.title}" (${policy.id}) for brand "${brandId}" in Supabase: ${error.message}`
    );
    return {
      error: {
        error: "indexing_failed",
        message: "Policy could not be saved because indexing failed. Please try again."
      }
    };
  }

  try {
    await request("", { method: "POST", body: JSON.stringify(toRow(policy)) });
  } catch (error) {
    console.error(
      `[structuredKnowledge] Failed to save policy record for "${policy.id}" after indexing succeeded — rolling back chunk: ${error.message}`
    );
    await deleteStructuredIndex({ brandId, itemId: policy.id, type: "policy" }).catch((rollbackError) => {
      console.error(
        `[structuredKnowledge] Rollback of orphaned chunk also failed for "${policy.id}": ${rollbackError.message}`
      );
    });
    return {
      error: {
        error: "save_failed",
        message: "Policy could not be saved. Please try again."
      }
    };
  }

  return { item: policy };
}

async function updatePolicy({ brandId, policyId, updates }) {
  const validationError = validatePolicyInput(updates, { partial: true });
  if (validationError) return { error: validationError };

  const rows = await request(
    `?brand_id=eq.${encodeFilter(brandId)}&type=eq.policy&id=eq.${encodeFilter(policyId)}&select=*`
  );
  const current = Array.isArray(rows) && rows.length ? fromRow(rows[0]) : null;

  if (!current) {
    return { error: { error: "policy_not_found", message: "Policy not found for this brand." } };
  }

  const updated = {
    ...current,
    policyType: updates.policyType !== undefined ? normalizePolicyType(updates.policyType) : current.policyType,
    title: updates.title !== undefined ? normalizeString(updates.title) : current.title,
    content: updates.content !== undefined ? normalizeString(updates.content) : current.content,
    tags: updates.tags !== undefined ? normalizeTags(updates.tags) : current.tags,
    updatedAt: new Date().toISOString()
  };

  try {
    await indexStructuredItem(updated);
  } catch (error) {
    console.error(
      `[structuredKnowledge] Failed to reindex policy "${policyId}" for brand "${brandId}" — structured record left unchanged: ${error.message}`
    );
    return {
      error: {
        error: "indexing_failed",
        message: "Policy could not be updated because indexing failed. Please try again."
      }
    };
  }

  try {
    await request(`?id=eq.${encodeFilter(policyId)}`, {
      method: "PATCH",
      body: JSON.stringify(toRow(updated))
    });
  } catch (error) {
    console.error(
      `[structuredKnowledge] Failed to save updated policy record for "${policyId}" after reindexing succeeded — reverting chunk to previous content: ${error.message}`
    );
    await indexStructuredItem(current).catch((revertError) => {
      console.error(
        `[structuredKnowledge] Revert-to-previous-content also failed for "${policyId}": ${revertError.message}`
      );
    });
    return {
      error: {
        error: "save_failed",
        message: "Policy could not be saved. Please try again."
      }
    };
  }

  return { item: updated };
}

async function createFaq({ brandId, question, answer, tags }) {
  const validationError = validateFaqInput({ question, answer });
  if (validationError) return { error: validationError };

  const now = new Date().toISOString();
  const faq = {
    id: createId("faq"),
    brandId,
    type: "faq",
    source: "manual",
    question: normalizeString(question),
    answer: normalizeString(answer),
    tags: normalizeTags(tags),
    metadata: {
      sourceType: "manual",
      futureSources: ["website_scraping", "notion_import"]
    },
    createdAt: now,
    updatedAt: now
  };

  try {
    await indexStructuredItem(faq);
  } catch (error) {
    console.error(
      `[structuredKnowledge] Failed to index FAQ "${faq.question}" (${faq.id}) for brand "${brandId}" in Supabase: ${error.message}`
    );
    return {
      error: {
        error: "indexing_failed",
        message: "FAQ could not be saved because indexing failed. Please try again."
      }
    };
  }

  try {
    await request("", { method: "POST", body: JSON.stringify(toRow(faq)) });
  } catch (error) {
    console.error(
      `[structuredKnowledge] Failed to save FAQ record for "${faq.id}" after indexing succeeded — rolling back chunk: ${error.message}`
    );
    await deleteStructuredIndex({ brandId, itemId: faq.id, type: "faq" }).catch((rollbackError) => {
      console.error(
        `[structuredKnowledge] Rollback of orphaned chunk also failed for "${faq.id}": ${rollbackError.message}`
      );
    });
    return {
      error: {
        error: "save_failed",
        message: "FAQ could not be saved. Please try again."
      }
    };
  }

  return { item: faq };
}

async function updateFaq({ brandId, faqId, updates }) {
  const validationError = validateFaqInput(updates, { partial: true });
  if (validationError) return { error: validationError };

  const rows = await request(
    `?brand_id=eq.${encodeFilter(brandId)}&type=eq.faq&id=eq.${encodeFilter(faqId)}&select=*`
  );
  const current = Array.isArray(rows) && rows.length ? fromRow(rows[0]) : null;

  if (!current) {
    return { error: { error: "faq_not_found", message: "FAQ not found for this brand." } };
  }

  const updated = {
    ...current,
    question: updates.question !== undefined ? normalizeString(updates.question) : current.question,
    answer: updates.answer !== undefined ? normalizeString(updates.answer) : current.answer,
    tags: updates.tags !== undefined ? normalizeTags(updates.tags) : current.tags,
    updatedAt: new Date().toISOString()
  };

  try {
    await indexStructuredItem(updated);
  } catch (error) {
    console.error(
      `[structuredKnowledge] Failed to reindex FAQ "${faqId}" for brand "${brandId}" — structured record left unchanged: ${error.message}`
    );
    return {
      error: {
        error: "indexing_failed",
        message: "FAQ could not be updated because indexing failed. Please try again."
      }
    };
  }

  try {
    await request(`?id=eq.${encodeFilter(faqId)}`, {
      method: "PATCH",
      body: JSON.stringify(toRow(updated))
    });
  } catch (error) {
    console.error(
      `[structuredKnowledge] Failed to save updated FAQ record for "${faqId}" after reindexing succeeded — reverting chunk to previous content: ${error.message}`
    );
    await indexStructuredItem(current).catch((revertError) => {
      console.error(
        `[structuredKnowledge] Revert-to-previous-content also failed for "${faqId}": ${revertError.message}`
      );
    });
    return {
      error: {
        error: "save_failed",
        message: "FAQ could not be saved. Please try again."
      }
    };
  }

  return { item: updated };
}

async function deleteItem({ brandId, itemId, type }) {
  const deletedRows = await request(
    `?brand_id=eq.${encodeFilter(brandId)}&type=eq.${encodeFilter(type)}&id=eq.${encodeFilter(itemId)}`,
    {
      method: "DELETE",
      headers: { Prefer: "return=representation" }
    }
  );

  if (!Array.isArray(deletedRows) || deletedRows.length === 0) {
    return { deleted: false };
  }

  const indexResult = await deleteStructuredIndex({ brandId, itemId, type });
  return { deleted: true, deletedChunks: indexResult.deletedChunks };
}

async function getStructuredStats(brandId) {
  const rows = await request(`?brand_id=eq.${encodeFilter(brandId)}&select=type`);
  const brandItems = Array.isArray(rows) ? rows : [];

  return {
    policyCount: brandItems.filter((item) => item.type === "policy").length,
    faqCount: brandItems.filter((item) => item.type === "faq").length,
    itemCount: brandItems.length
  };
}

module.exports = {
  POLICY_TYPES: Array.from(POLICY_TYPES),
  createPolicy,
  updatePolicy,
  createFaq,
  updateFaq,
  deleteItem,
  deleteStructuredIndex,
  getStructuredStats,
  indexStructuredItem,
  listItems
};
