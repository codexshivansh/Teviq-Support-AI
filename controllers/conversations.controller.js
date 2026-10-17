const { getBrandOrRespond } = require("./helpers/brandLookup");
const { listConversations } = require("../services/conversations.service");

async function getConversations(req, res) {
  const brand = await getBrandOrRespond(req, res);
  if (!brand) return;

  const requestedDays = Number(req.query.days);
  const days = Number.isFinite(requestedDays) && requestedDays > 0
    ? Math.min(3650, requestedDays)
    : null;
  const channel = typeof req.query.channel === "string" && req.query.channel.trim()
    ? req.query.channel.trim().toLowerCase()
    : null;
  const conversations = await listConversations({ brandId: brand.brandId, days, channel });

  return res.json({ ok: true, brandId: brand.brandId, days, channel, conversations });
}

module.exports = { getConversations };
