const { getBrandOrRespond } = require("./helpers/brandLookup");
const { listConversations } = require("../services/conversations.service");

async function getConversations(req, res) {
  const brand = await getBrandOrRespond(req, res);
  if (!brand) return;

  const days = Math.max(1, Math.min(365, Number(req.query.days) || 30));
  const conversations = await listConversations({ brandId: brand.brandId, days });

  return res.json({ ok: true, brandId: brand.brandId, days, conversations });
}

module.exports = { getConversations };
