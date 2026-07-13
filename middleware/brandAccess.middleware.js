const {
  getUserPublicMetadata,
  getMetadataBrandId,
  setUserBrandId
} = require("../services/clerkMetadata.service");
const { getBrandById } = require("../services/brand.service");

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

  // Auto-provision: if the user has NO brandId set at all (fresh account,
  // onboarding never finished / metadata got wiped), assign them to the
  // requested brand as long as the brand actually exists. This bootstraps
  // access without forcing them back through the onboarding wizard, which
  // is the whole reason the Documents tab was hitting a wall.
  if (!assignedBrandId) {
    try {
      const brand = await getBrandById(requestedBrandId);
      if (!brand) {
        return res.status(404).json({
          error: "brand_not_found",
          message: `Brand "${requestedBrandId}" does not exist.`
        });
      }

      console.log(
        `[brandAccess] Auto-provisioning user "${req.auth.userId}" to brand "${requestedBrandId}"`
      );
      await setUserBrandId(req.auth.userId, requestedBrandId);
      return next();
    } catch (error) {
      console.error(
        `[brandAccess] Auto-provision failed for user "${req.auth?.userId}" -> brand "${requestedBrandId}": ${error.message}`
      );
      return res.status(500).json({
        error: "brand_auto_provision_failed",
        message: `Could not auto-assign brand access: ${error.message}`
      });
    }
  }

  return res.status(403).json({
    error: "brand_access_denied",
    message: `Your account is assigned to brand "${assignedBrandId}", not "${requestedBrandId}".`
  });
}

module.exports = { requireBrandAccess };
