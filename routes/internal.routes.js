const express = require("express");
const {
  runDelayCheck,
  runCartRecoveryCheck,
  runInstagramTokenRefresh
} = require("../controllers/internal.controller");
const { asyncHandler } = require("../middleware/asyncHandler");

const router = express.Router();

router.post("/run-delay-check", asyncHandler(runDelayCheck));
router.post("/run-cart-recovery-check", asyncHandler(runCartRecoveryCheck));
router.post("/refresh-instagram-tokens", asyncHandler(runInstagramTokenRefresh));

router.post('/reconcile-billing', asyncHandler(async (req, res) => {
  const service = require('../services/subscriptionBilling.service');
  const deps = service.dependencies();
  const rows = await service.result(deps.db.from('billing_subscriptions').select('*').order('last_checked_at', { ascending: true, nullsFirst: true }).limit(25));
  const summary = { checked: 0, pending: 0 };
  for (const row of rows) {
    try { await service.reconcile(row, deps); summary.checked++; }
    catch { summary.pending++; await service.result(deps.db.from('billing_subscriptions').update({ last_checked_at: new Date().toISOString() }).eq('id', row.id)); }
  }
  res.json(summary);
}));
module.exports = router;
