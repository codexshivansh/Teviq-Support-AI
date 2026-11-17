const structuredKnowledge = require("../knowledge/structuredKnowledge.service");

const PRICING_QUERY_PATTERN =
  /\b(?:pricings?|prices?|cost|costing|plans?|charges?|rate|kitna|kitne|kya price|how much)\b/i;

function isPricingQuestion(message) {
  return PRICING_QUERY_PATTERN.test(String(message || ""));
}

function prefersEnglish(message, language) {
  if (language === "english") return true;
  return /\b(?:what|how much|prices?|pricings?|cost|charges?)\b/i.test(String(message || ""));
}

function looksEnglish(question) {
  return /\b(?:what|how|price|pricing|cost|plan)\b/i.test(String(question || "")) &&
    !/\b(?:kya|kitna|kitne|hai|hain)\b/i.test(String(question || ""));
}

function pricingScore(faq) {
  const tags = Array.isArray(faq.tags) ? faq.tags.map((tag) => String(tag).toLowerCase()) : [];
  const question = String(faq.question || "");
  let score = 0;
  if (tags.includes("cost")) score += 6;
  if (/\b(?:pricing|prices?|cost|plans?)\b/i.test(question)) score += 5;
  if (tags.includes("pricing")) score += 2;
  if (tags.includes("trial") || /\b(?:trial|try|paying)\b/i.test(question)) score -= 6;
  return score;
}

async function resolveStructuredFaq({ brandId, message, language }) {
  if (!brandId || !isPricingQuestion(message)) return null;

  const faqs = await structuredKnowledge.listItems({ brandId, type: "faq", search: "pricing" });
  const pricingFaqs = faqs
    .map((faq) => ({ faq, score: pricingScore(faq) }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score);
  if (!pricingFaqs.length) return null;

  const wantEnglish = prefersEnglish(message, language);
  const bestScore = pricingFaqs[0].score;
  const best = pricingFaqs.filter(({ score }) => score === bestScore).map(({ faq }) => faq);
  return best.find((faq) => looksEnglish(faq.question) === wantEnglish) || best[0];
}

module.exports = { isPricingQuestion, resolveStructuredFaq };
