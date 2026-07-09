const { listBrands } = require("../services/brand.service");
const { findDelayedOrders } = require("../services/delayDetection.service");
const { sendDelayAlert } = require("../integrations/twilio/smsAlert.service");
const { hasAlertBeenSent, recordAlertAttempt } = require("../services/delayAlertRecord.service");

async function runDelayCheck(req, res) {
  const brands = await listBrands();

  const results = {
    checked: 0,
    newAlerts: 0,
    skippedAlreadyProcessed: 0,
    failed: 0,
    details: []
  };

  for (const brand of brands) {
    const delayedOrders = findDelayedOrders(brand.brandId);

    for (const order of delayedOrders) {
      results.checked += 1;

      let alreadySent = false;
      try {
        alreadySent = await hasAlertBeenSent({ brandId: brand.brandId, orderId: order.orderId });
      } catch (error) {
        console.error(
          `[internal] Idempotency check failed for ${brand.brandId}/${order.orderId}: ${error.message}`
        );
        results.failed += 1;
        results.details.push({ brandId: brand.brandId, orderId: order.orderId, outcome: "idempotency_check_failed" });
        continue;
      }

      if (alreadySent) {
        results.skippedAlreadyProcessed += 1;
        results.details.push({ brandId: brand.brandId, orderId: order.orderId, outcome: "already_processed" });
        continue;
      }

      let sendResult = { sent: false, reason: "send_failed" };
      let sendError = null;
      try {
        sendResult = await sendDelayAlert({
          phone: order.customerPhone,
          orderId: order.orderId,
          brandName: brand.brandName
        });
      } catch (error) {
        sendError = error.message;
      }

      const status = sendResult.sent
        ? "sent"
        : sendResult.reason === "not_configured"
          ? "skipped_not_configured"
          : "failed";

      try {
        await recordAlertAttempt({
          brandId: brand.brandId,
          orderId: order.orderId,
          customerPhone: order.customerPhone,
          status,
          errorMessage: sendError
        });
      } catch (error) {
        console.error(
          `[internal] Failed to record delay-alert attempt for ${brand.brandId}/${order.orderId}: ${error.message}`
        );
      }

      results.newAlerts += 1;
      results.details.push({ brandId: brand.brandId, orderId: order.orderId, outcome: status });
    }
  }

  return res.json({ ok: true, ...results });
}

module.exports = { runDelayCheck };
