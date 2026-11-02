const express = require('express');
const { requireBrandAccess } = require('../middleware/brandAccess.middleware');
const { getUserPublicMetadata } = require('../services/clerkMetadata.service');
const { asyncHandler } = require('../middleware/asyncHandler');
const { listChannelMessageReviews, reviewChannelMessage } = require('../services/channelMessageInbox.service');
const router = express.Router();

router.use((req, res, next) => {
  if (req.auth?.sessionType !== 'clerk' || !req.auth?.userId) return res.status(401).json({ error: 'real_session_required' });
  next();
});

router.get('/:brandId', requireBrandAccess, asyncHandler(async (req, res) => {
  const before = req.query.before;
  if (before && !/^[1-9][0-9]{0,18}$/.test(String(before))) return res.status(400).json({ error: 'invalid_cursor' });
  res.json(await listChannelMessageReviews(req.params.brandId, before));
}));

router.post('/:brandId/:id/review', requireBrandAccess, asyncHandler(async (req, res) => {
  const { action, reason, confirmedNotDelivered } = req.body || {};
  if (!/^[1-9][0-9]{0,18}$/.test(req.params.id) || !['resolve','retry_reply'].includes(action) ||
      typeof reason !== 'string' || reason.trim().length < 10 || reason.length > 1000) {
    return res.status(400).json({ error: 'invalid_review', message: 'Choose an action and provide a review note (10–1000 characters).' });
  }
  if (action === 'retry_reply') {
    const metadata = await getUserPublicMetadata(req.auth.userId);
    if (metadata.role !== 'teviq_admin') return res.status(403).json({ error: 'admin_required' });
    if (confirmedNotDelivered !== true) return res.status(400).json({ error: 'delivery_confirmation_required' });
  }
  const changed = await reviewChannelMessage({ id: req.params.id, brandId: req.params.brandId,
    actorId: req.auth.userId, action, reason: reason.trim() });
  if (!changed) return res.status(409).json({ error: 'review_state_changed', message: 'This event cannot take that action. Refresh and review its latest state.' });
  res.json({ ok: true });
}));

module.exports = router;
