const { getUserPublicMetadata, getMetadataBrandId } = require("../services/clerkMetadata.service");

async function requireBrandAccess(req, res, next) {
  if (req.auth?.sessionType === "demo") {
    return next();
  }

  let publicMetadata;
  try {
    publicMetadata = await getUserPublicMetadata(req.auth.userId);
  } catch (error) {
    console.error(
      `[brandAccess] Failed to fetch Clerk metadata for user "${req.auth?.userId}": ${error.message}`
    );
    return res.status(error.statusCode || 503).json({
      error: error.code || "brand_access_check_failed",
      message: `Could not verify brand access: ${error.message}`
    });
  }

  const isAdmin = publicMetadata.role === "teviq_admin";
  const assignedBrandId = getMetadataBrandId(publicMetadata);
  const requestedBrandId = req.params.brandId;

  if (isAdmin) {
    return next();
  }

  if (assignedBrandId === requestedBrandId) {
    return next();
  }

  // Note: we used to auto-provision access here when the user had no
  // brandId set — that turned out to be dangerous because admins were
  // being silently locked into whichever brand URL loaded first,
  // overwriting their `teviq_admin` intent to view any workspace. If
  // access needs to be granted, do it explicitly via the /api/onboarding
  // flow or Clerk dashboard instead.
  return res.status(403).json({
    error: "brand_access_denied",
    message: assignedBrandId
      ? `Your account is assigned to brand "${assignedBrandId}", not "${requestedBrandId}".`
      : `Your account has no brand assigned. Complete onboarding or ask an admin to assign one.`
  });
}

module.exports = { requireBrandAccess };
