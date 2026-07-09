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
      message: "Could not verify brand access right now. Please try again."
    });
  }

  const isAdmin = publicMetadata.role === "teviq_admin";
  const assignedBrandId = getMetadataBrandId(publicMetadata);

  if (!isAdmin && assignedBrandId !== req.params.brandId) {
    return res.status(403).json({
      error: "brand_access_denied",
      message: "You do not have access to this brand workspace."
    });
  }

  return next();
}

module.exports = { requireBrandAccess };
