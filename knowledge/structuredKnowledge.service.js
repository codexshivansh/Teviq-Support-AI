const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { chunkText } = require("./chunking.service");
const { embedChunks } = require("./embedding.service");
const vectorStore = require("./vectorStore.service");

const knowledgeDataDir = path.join(__dirname, "..", "data", "knowledge");
const structuredKnowledgePath = path.join(knowledgeDataDir, "structured-knowledge.json");

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

function ensureStore() {
  if (!fs.existsSync(knowledgeDataDir)) {
    fs.mkdirSync(knowledgeDataDir, { recursive: true });
  }

  if (!fs.existsSync(structuredKnowledgePath)) {
    fs.writeFileSync(structuredKnowledgePath, JSON.stringify({ version: 1, items: [] }, null, 2));
  }
}

function readStore() {
  ensureStore();
  try {
    const raw = fs.readFileSync(structuredKnowledgePath, "utf8");
    const parsed = JSON.parse(raw);
    return {
      version: parsed.version || 1,
      items: Array.isArray(parsed.items) ? parsed.items : []
    };
  } catch (error) {
    return { version: 1, items: [] };
  }
}

function writeStore(store) {
  ensureStore();
  fs.writeFileSync(structuredKnowledgePath, JSON.stringify(store, null, 2));
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
  const embeddedChunks = embedChunks(chunks);

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

function listItems({ brandId, type, search = "" }) {
  const store = readStore();
  return store.items
    .filter((item) => item.brandId === brandId && item.type === type)
    .filter((item) => itemMatchesSearch(item, search))
    .sort((a, b) => new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt));
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

  const store = readStore();
  store.items.push(policy);
  writeStore(store);
  await indexStructuredItem(policy);

  return { item: policy };
}

async function updatePolicy({ brandId, policyId, updates }) {
  const validationError = validatePolicyInput(updates, { partial: true });
  if (validationError) return { error: validationError };

  const store = readStore();
  const index = store.items.findIndex(
    (item) => item.brandId === brandId && item.type === "policy" && item.id === policyId
  );

  if (index === -1) {
    return { error: { error: "policy_not_found", message: "Policy not found for this brand." } };
  }

  const current = store.items[index];
  const updated = {
    ...current,
    policyType: updates.policyType !== undefined ? normalizePolicyType(updates.policyType) : current.policyType,
    title: updates.title !== undefined ? normalizeString(updates.title) : current.title,
    content: updates.content !== undefined ? normalizeString(updates.content) : current.content,
    tags: updates.tags !== undefined ? normalizeTags(updates.tags) : current.tags,
    updatedAt: new Date().toISOString()
  };

  store.items[index] = updated;
  writeStore(store);
  await deleteStructuredIndex({ brandId, itemId: policyId, type: "policy" });
  await indexStructuredItem(updated);

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

  const store = readStore();
  store.items.push(faq);
  writeStore(store);
  await indexStructuredItem(faq);

  return { item: faq };
}

async function updateFaq({ brandId, faqId, updates }) {
  const validationError = validateFaqInput(updates, { partial: true });
  if (validationError) return { error: validationError };

  const store = readStore();
  const index = store.items.findIndex(
    (item) => item.brandId === brandId && item.type === "faq" && item.id === faqId
  );

  if (index === -1) {
    return { error: { error: "faq_not_found", message: "FAQ not found for this brand." } };
  }

  const current = store.items[index];
  const updated = {
    ...current,
    question: updates.question !== undefined ? normalizeString(updates.question) : current.question,
    answer: updates.answer !== undefined ? normalizeString(updates.answer) : current.answer,
    tags: updates.tags !== undefined ? normalizeTags(updates.tags) : current.tags,
    updatedAt: new Date().toISOString()
  };

  store.items[index] = updated;
  writeStore(store);
  await deleteStructuredIndex({ brandId, itemId: faqId, type: "faq" });
  await indexStructuredItem(updated);

  return { item: updated };
}

async function deleteItem({ brandId, itemId, type }) {
  const store = readStore();
  const nextItems = store.items.filter(
    (item) => !(item.brandId === brandId && item.type === type && item.id === itemId)
  );

  if (nextItems.length === store.items.length) {
    return { deleted: false };
  }

  writeStore({ ...store, items: nextItems });
  const indexResult = await deleteStructuredIndex({ brandId, itemId, type });
  return { deleted: true, deletedChunks: indexResult.deletedChunks };
}

function getStructuredStats(brandId) {
  const store = readStore();
  const brandItems = store.items.filter((item) => item.brandId === brandId);

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
  listItems,
  structuredKnowledgePath
};
