const { getBrandOrRespond } = require("./helpers/brandLookup");
const { listConversations } = require("../services/conversations.service");

async function getConversations(req, res) {
  const brand = await getBrandOrRespond(req, res);
  if (!brand) return;

  const days = Math.max(1, Math.min(365, Number(req.query.days) || 30));
  const channel = typeof req.query.channel === "string" && req.query.channel.trim()
    ? req.query.channel.trim().toLowerCase()
    : null;
  const conversations = await listConversations({ brandId: brand.brandId, days, channel });

  return res.json({ ok: true, brandId: brand.brandId, days, channel, conversations });
}

module.exports = { getConversations };
