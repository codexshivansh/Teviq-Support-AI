const express = require("express");
const { getConversations } = require("../controllers/conversations.controller");
const { asyncHandler } = require("../middleware/asyncHandler");
const { requireBrandAccess } = require("../middleware/brandAccess.middleware");
const { getConversationHandoff, setConversationHandoff } = require('../services/conversationHandoff.service');

const router = express.Router();

router.get("/:brandId", requireBrandAccess, asyncHandler(getConversations));

function validateHandoff(req, res, next) {
  if (req.auth?.sessionType !== 'clerk' || !req.auth?.userId) return res.status(401).json({ error: 'real_session_required' });
  if (!['widget','whatsapp','instagram'].includes(req.params.channel) || !req.params.customerId || req.params.customerId.length > 200) {
    return res.status(400).json({ error: 'invalid_conversation' });
  }
  next();
}
router.get('/:brandId/:channel/:customerId/handoff', validateHandoff, requireBrandAccess, asyncHandler(async (req, res) => {
  res.json(await getConversationHandoff(req.params));
}));
router.put('/:brandId/:channel/:customerId/handoff', validateHandoff, requireBrandAccess, asyncHandler(async (req, res) => {
  if (typeof req.body?.paused !== 'boolean') return res.status(400).json({ error: 'invalid_handoff' });
  await setConversationHandoff({ ...req.params, actorId: req.auth.userId, paused: req.body.paused });
  res.json(await getConversationHandoff(req.params));
}));

module.exports = router;
