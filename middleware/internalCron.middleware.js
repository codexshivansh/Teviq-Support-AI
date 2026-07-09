const crypto = require("crypto");

// Protects internal, cron-triggered endpoints. Independent of
// requireClerkAuth/requireBrandAccess — there is no demo-auth bypass here,
// since this endpoint has real side effects (sending SMS). Uses a
// constant-time comparison so response timing can't be used to guess the
// secret byte-by-byte.
function requireInternalCronSecret(req, res, next) {
  const expected = process.env.INTERNAL_CRON_SECRET || "";
  if (!expected) {
    console.error("[internalCron] INTERNAL_CRON_SECRET is not configured — rejecting all requests.");
    return res.status(503).json({
      error: "internal_cron_not_configured",
      message: "Internal cron secret is not configured."
    });
  }

  const authHeader = req.get("authorization") || "";
  const provided = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";

  const expectedBuffer = Buffer.from(expected);
  const providedBuffer = Buffer.from(provided);

  // timingSafeEqual throws if the buffers differ in length, so the length
  // check must happen first. This does leak whether the length matches,
  // but not the secret's content, which is the standard accepted tradeoff
  // for this pattern.
  const isValid =
    expectedBuffer.length === providedBuffer.length &&
    crypto.timingSafeEqual(expectedBuffer, providedBuffer);

  if (!isValid) {
    return res.status(401).json({
      error: "unauthorized",
      message: "Invalid or missing internal cron secret."
    });
  }

  return next();
}

module.exports = { requireInternalCronSecret };
