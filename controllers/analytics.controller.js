const { getBrandOrRespond } = require("./helpers/brandLookup");
const {
  getTotalConversations,
  getEscalationRate,
  getDeflectionRate,
  getTopIntents,
  getTopQuestions,
  getTopUnresolvedQuestions,
  getEscalationTrend,
  getResponseTimeStats,
  getFailedAnswersCount
} = require("../services/chatAnalytics.service");

async function getAnalytics(req, res) {
  const brand = await getBrandOrRespond(req, res);
  if (!brand) return;

  const days = Math.max(1, Math.min(365, Number(req.query.days) || 30));
  const brandId = brand.brandId;

  const [
    totalConversations,
    escalationRate,
    deflectionRate,
    topIntents,
    topQuestions,
    topUnresolvedQuestions,
    escalationTrend,
    responseTimeStats,
    failedAnswersCount
  ] = await Promise.all([
    getTotalConversations(brandId, days),
    getEscalationRate(brandId, days),
    getDeflectionRate(brandId, days),
    getTopIntents(brandId, days),
    getTopQuestions(brandId, days),
    getTopUnresolvedQuestions(brandId, days),
    getEscalationTrend(brandId, days),
    getResponseTimeStats(brandId, days),
    getFailedAnswersCount(brandId, days)
  ]);

  return res.json({
    brandId,
    days,
    totalConversations,
    escalationRate,
    deflectionRate,
    topIntents,
    topQuestions,
    topUnresolvedQuestions,
    escalationTrend,
    responseTimeStats,
    failedAnswersCount
  });
}

module.exports = { getAnalytics };
