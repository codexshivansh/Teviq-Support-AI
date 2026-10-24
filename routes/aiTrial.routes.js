const express = require('express');
const { requireBrandAccess } = require('../middleware/brandAccess.middleware');
const { asyncHandler } = require('../middleware/asyncHandler');
const { getUserPublicMetadata } = require('../services/clerkMetadata.service');
const { getAiUsageSummary, saveTrialLimit, meteringEnabled } = require('../services/aiUsage.service');

const router = express.Router();

router.get('/:brandId', requireBrandAccess, asyncHandler(async (req, res) => {
  if (req.auth?.sessionType === 'demo') return res.status(403).json({ error: 'brand_access_denied' });
  if (!meteringEnabled()) return res.json({ meteringEnabled: false, trial: null });
  return res.json(await getAiUsageSummary(req.params.brandId));
}));

router.put('/:brandId', requireBrandAccess, asyncHandler(async (req, res) => {
  if (req.auth?.sessionType === 'demo') return res.status(403).json({ error: 'admin_required' });
  const metadata = await getUserPublicMetadata(req.auth.userId);
  if (metadata.role !== 'teviq_admin') return res.status(403).json({ error: 'admin_required' });
  if (!meteringEnabled()) return res.status(503).json({ error: 'metering_not_enabled' });

  const { enabled, startsAt, endsAt, maxCallsPerDay, maxTokensPerDay } = req.body || {};
  const start = Date.parse(startsAt);
  const end = Date.parse(endsAt);
  if (typeof enabled !== 'boolean' || !Number.isFinite(start) || !Number.isFinite(end) || end <= start ||
      !Number.isSafeInteger(maxCallsPerDay) || maxCallsPerDay < 1 || maxCallsPerDay > 1000 ||
      !Number.isSafeInteger(maxTokensPerDay) || maxTokensPerDay < 1 || maxTokensPerDay > 100000) {
    return res.status(400).json({ error: 'invalid_trial_limits' });
  }
  const trial = await saveTrialLimit(req.params.brandId, {
    enabled,
    starts_at: new Date(start).toISOString(),
    ends_at: new Date(end).toISOString(),
    max_calls_per_day: maxCallsPerDay,
    max_tokens_per_day: maxTokensPerDay
  });
  return res.json({ trial });
}));

module.exports = router;
