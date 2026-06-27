const shopifyDemoProvider = require("../integrations/shopify/shopifyDemo.provider");

function tokenize(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 1);
}

function scoreProduct(product, message) {
  const queryTokens = tokenize(message);
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

  return queryTokens.reduce((score, token) => {
    if (searchable.includes(token)) return score + 2;
    return score;
  }, 0);
}

function getRecommendedProducts({ brandId, message, limit = 3 }) {
  const products = shopifyDemoProvider.getProducts(brandId).filter((product) => product.available !== false);

  return products
    .map((product) => ({
      ...product,
      matchScore: scoreProduct(product, message)
    }))
    .sort((left, right) => right.matchScore - left.matchScore || left.price - right.price)
    .slice(0, limit);
}

function buildProductRecommendationReply({ brand, products, message }) {
  const matchedProducts = products.filter((product) => product.matchScore > 0);
  const selectedProducts = matchedProducts.length ? matchedProducts : products.slice(0, 3);

  if (!selectedProducts.length) {
    return null;
  }

  const lines = selectedProducts.map((product, index) => {
    const price = product.price ? ` - INR ${product.price}` : "";
    return `${index + 1}. ${product.title}${price}: ${product.recommendationText || product.description}`;
  });

  return [
    `Here are ${brand.brandName} options that fit your request:`,
    ...lines,
    "Tell me your budget or use case and I can narrow it further."
  ].join("\n");
}

module.exports = {
  getRecommendedProducts,
  buildProductRecommendationReply
};
