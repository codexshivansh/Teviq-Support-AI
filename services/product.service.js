const shopifyDemoProvider = require("../integrations/shopify/shopifyDemo.provider");
const shopifyCacheStore = require("../integrations/shopify/shopifyCache.store");

const DEMO_BRAND_IDS = new Set(["vastra-demo", "urban-demo", "beauty-demo"]);
const PRODUCT_SEARCH_STOPWORDS = new Set([
  "recommend",
  "suggest",
  "best",
  "which",
  "what",
  "should",
  "buy",
  "show",
  "need",
  "want",
  "something",
  "product",
  "item",
  "looking",
  "for",
  "from",
  "with",
  "and",
  "or",
  "but",
  "the",
  "to",
  "of",
  "in",
  "on",
  "at",
  "is",
  "that",
  "this",
  "have",
  "has",
  "am",
  "are",
  "was",
  "were",
  "it",
  "my",
  "me",
  "use",
  "using",
  "under",
  "budget",
  "inr",
  "rs",
  "rupees",
  "please",
  "mere",
  "mujhe",
  "andar"
]);

// Order matters: patterns are tried in sequence and the first match wins.
// The bare-number pattern requires an explicit qualifier (ke andar/se kam/
// tak/rupees + qualifier) so a plain price mention like "2000 rupees ka hai"
// is never mistaken for a budget constraint.
const BUDGET_PATTERNS = [
  /\bunder\s*(?:inr|rs\.?|₹)?\s*(\d{2,7})\b/i,
  /\bbudget\s*(?:is|:|of)?\s*(?:inr|rs\.?|₹)?\s*(\d{2,7})\b/i,
  /(?:inr|rs\.?|₹)?\s*(\d{2,7})\s*(?:ke\s*andar|se\s*kam|tak|rupees\s*(?:ke\s*andar|se\s*kam|tak))\b/i
];

function parseBudget(message) {
  const text = String(message || "");
  for (const pattern of BUDGET_PATTERNS) {
    const match = text.match(pattern);
    if (match && match[1]) {
      const value = parseInt(match[1], 10);
      if (!Number.isNaN(value)) return value;
    }
  }
  return null;
}

const PRODUCT_SUITABILITY_PATTERN =
  /\b(?:beginner|first[- ]time|easy to (?:use|control|handle)|comfortable|comfort|lightweight|durable|sensitive skin|skin type|easy setup)\b/i;

function normalizeCatalogProduct(product) {
  const parsedPrice = Number.parseFloat(product.price);
  return {
    ...product,
    price: Number.isFinite(parsedPrice) ? parsedPrice : null,
    currency: product.currency || "INR",
    tags: Array.isArray(product.tags) ? product.tags : [],
    keywords: Array.isArray(product.keywords) ? product.keywords : []
  };
}

async function getCatalogProducts(brandId, message = "") {
  if (DEMO_BRAND_IDS.has(brandId)) {
    return shopifyDemoProvider.getProducts(brandId).map(normalizeCatalogProduct);
  }

  try {
    const searchTerms = tokenize(message).filter(
      (token) => !PRODUCT_SEARCH_STOPWORDS.has(token) && !/^\d+$/.test(token)
    );
    const products = await shopifyCacheStore.searchProducts(brandId, searchTerms, 100);
    return products.map(normalizeCatalogProduct);
  } catch (error) {
    console.error(
      `[product-service] Shopify catalog lookup failed for brand ${brandId}: ${error.code || error.message}`
    );
    return [];
  }
}

async function detectCategory(brandId, message) {
  const categories = [
    ...new Set((await getCatalogProducts(brandId, message)).map((product) => product.category).filter(Boolean))
  ];
  const lowerMessage = String(message || "").toLowerCase();
  return categories.find((category) => lowerMessage.includes(category.toLowerCase())) || null;
}

function tokenize(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 1);
}

function scoreProduct(product, message) {
  const queryTokens = tokenize(message).filter(
    (token) => !PRODUCT_SEARCH_STOPWORDS.has(token) && !/^\d+$/.test(token)
  );
  const searchable = [
    product.title,
    product.handle,
    product.category,
    product.description,
    product.recommendationText,
    ...(product.tags || []),
    ...(product.keywords || [])
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  const searchableTokens = new Set(tokenize(searchable));

  return queryTokens.reduce((score, token) => {
    if (searchableTokens.has(token)) return score + 2;
    return score;
  }, 0);
}

// Used by intentEngine.js as a secondary signal: a message with no explicit
// "recommend/suggest" wording but a real product-keyword hit (title/handle/
// category/tags/keywords) plus a budget is still a product query, e.g.
// "kurta 1500 ke andar".
function hasProductKeywordMatch(brandId, message) {
  const products = shopifyDemoProvider.getProducts(brandId).filter((product) => product.available !== false);
  return products.some((product) => scoreProduct(product, message) > 0);
}

async function getRecommendedProducts({ brandId, message, limit = 3, maxBudget }) {
  const products = (await getCatalogProducts(brandId, message)).filter((product) => product.available !== false);
  const budget = maxBudget != null ? maxBudget : parseBudget(message);

  const scored = products.map((product) => ({
    ...product,
    matchScore: scoreProduct(product, message)
  }));

  const withinBudget =
    budget != null ? scored.filter((product) => typeof product.price !== "number" || product.price <= budget) : scored;

  return withinBudget
    .sort(
      (left, right) =>
        right.matchScore - left.matchScore || (left.price ?? Number.POSITIVE_INFINITY) - (right.price ?? Number.POSITIVE_INFINITY)
    )
    .slice(0, limit);
}

function buildProductRecommendationReply({ brand, products, message, maxBudget }) {
  const budget = maxBudget != null ? maxBudget : parseBudget(message);
  const matchedProducts = products.filter((product) => product.matchScore > 0);
  // No keyword match: only fall back to the (already budget-filtered) top
  // results when a budget was actually given. Without one, returning null
  // is the signal the caller uses to ask a narrowing question instead of
  // guessing with an irrelevant top-3.
  const selectedProducts = matchedProducts.length ? matchedProducts : budget != null ? products : [];

  if (!selectedProducts.length) {
    if (budget != null) {
      return `Maaf kijiye, ${brand.brandName} ke paas is budget (INR ${budget}) ke andar abhi koi matching product nahi hai. Thoda zyada budget ya category batayein?`;
    }
    return null;
  }

  const lines = selectedProducts.map((product, index) => {
    const price = product.price != null ? ` - ${product.currency || "INR"} ${product.price}` : "";
    const detail = product.recommendationText || product.description || "";
    return `${index + 1}. ${product.title}${price}${detail ? `: ${detail}` : ""}`;
  });

  const intro = matchedProducts.length
    ? `Here are ${brand.brandName} options that fit your request:`
    : `Yahan ${brand.brandName} ke options hain aapke budget ke andar:`;

  return [intro, ...lines, "Tell me your budget or use case and I can narrow it further."].join("\n");
}

function buildProductFollowUpReply({ brand, products, originalQuery, followUpMessage }) {
  const followUpHasCatalogEvidence = products.some(
    (product) => scoreProduct(product, followUpMessage) > 0
  );

  if (PRODUCT_SUITABILITY_PATTERN.test(followUpMessage) && !followUpHasCatalogEvidence) {
    const budget = parseBudget(originalQuery);
    const category = products.find((product) => product.category)?.category;
    const contextParts = [
      category ? category.toLowerCase() : null,
      budget != null ? `under INR ${budget}` : null
    ].filter(Boolean);
    const optionText = products
      .slice(0, 3)
      .map((product) => `${product.title}${product.price != null ? ` (INR ${product.price})` : ""}`)
      .join(", ");

    return [
      `I have kept your ${contextParts.join(" ") || "product"} requirement in context.`,
      "The synced catalog does not include beginner or ease-of-control details, so I cannot safely label one option as the easiest.",
      optionText ? `These options still match the confirmed catalog filters: ${optionText}.` : null
    ]
      .filter(Boolean)
      .join(" ");
  }

  return buildProductRecommendationReply({
    brand,
    products,
    message: `${originalQuery || ""} ${followUpMessage || ""}`.trim()
  });
}

module.exports = {
  parseBudget,
  detectCategory,
  getCatalogProducts,
  hasProductKeywordMatch,
  getRecommendedProducts,
  buildProductRecommendationReply,
  buildProductFollowUpReply
};
