const shopifyWebhookService = require("../integrations/shopify/shopifyWebhook.service");

async function receiveWebhook(req, res) {
  const result = await shopifyWebhookService.processWebhook({
    headers: req.headers,
    rawBody: req.body
  });
  return res.status(200).json({ ok: true, duplicate: Boolean(result.duplicate) });
}

module.exports = { receiveWebhook };
