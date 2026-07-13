const {
  getClerkClient,
  getMetadataBrandId,
  getUserPublicMetadata
} = require("../services/clerkMetadata.service");
const { getBrandById } = require("../services/brand.service");

// GET /api/me — returns the caller's Clerk metadata + resolved brandId.
// Useful for debugging "why can't I see this brand?" — the user can hit
// this from the browser to see exactly what their session looks like.
async function getMe(req, res) {
  if (!req.auth?.userId || req.auth.sessionType === "demo") {
    return res.status(400).json({
      error: "no_clerk_session",
      message: "Not a real Clerk session (demo mode or missing userId)."
    });
  }

  const publicMetadata = await getUserPublicMetadata(req.auth.userId);
  return res.json({
    userId: req.auth.userId,
    role: publicMetadata.role || null,
    brandId: getMetadataBrandId(publicMetadata),
    onboardingComplete: publicMetadata.onboarding_complete === true,
    publicMetadata
  });
}

// POST /api/me/brand { brandId } — set caller's brandId in Clerk metadata.
// Guarded with the DEBUG_SECRET header so it can't be freely mis-triggered.
// After running this, sign out and back in (or wait for the Clerk session
// to refresh) so the frontend picks up the new metadata.
async function setMyBrand(req, res) {
  if (!req.auth?.userId || req.auth.sessionType === "demo") {
    return res.status(400).json({
      error: "no_clerk_session",
      message: "Not a real Clerk session (demo mode or missing userId)."
    });
  }

  const debugSecret = req.get("x-debug-secret") || req.query.secret || "";
  const expectedSecret = process.env.DEBUG_SECRET || "teviq-debug-2026";
  if (debugSecret !== expectedSecret) {
    return res.status(403).json({
      error: "forbidden",
      message: "Debug secret required to change brand assignment."
    });
  }

  const brandId = String(req.body?.brandId || req.query.brandId || "").trim();
  if (!brandId) {
    return res.status(400).json({
      error: "missing_brand_id",
      message: "brandId is required (in JSON body or ?brandId=... query param)."
    });
  }

  const brand = await getBrandById(brandId);
  if (!brand) {
    return res.status(404).json({
      error: "brand_not_found",
      message: `Brand "${brandId}" does not exist in the database.`
    });
  }

  const clerkClient = getClerkClient();
  const user = await clerkClient.users.getUser(req.auth.userId);
  const publicMetadata = {
    ...(user.publicMetadata || {}),
    brandId
  };
  const updatedUser = await clerkClient.users.updateUserMetadata(req.auth.userId, {
    publicMetadata
  });

  return res.json({
    ok: true,
    message: `Your brandId is now "${brandId}". Sign out and back in for the frontend to pick it up.`,
    publicMetadata: updatedUser.publicMetadata || publicMetadata
  });
}

// POST /api/me/promote-admin — sets role=teviq_admin on caller's metadata.
// Guarded with DEBUG_SECRET. This is the escape hatch that lets you
// switch between all workspaces from the frontend workspace switcher.
async function promoteMeToAdmin(req, res) {
  if (!req.auth?.userId || req.auth.sessionType === "demo") {
    return res.status(400).json({
      error: "no_clerk_session",
      message: "Not a real Clerk session (demo mode or missing userId)."
    });
  }

  const debugSecret = req.get("x-debug-secret") || req.query.secret || "";
  const expectedSecret = process.env.DEBUG_SECRET || "teviq-debug-2026";
  if (debugSecret !== expectedSecret) {
    return res.status(403).json({
      error: "forbidden",
      message: "Debug secret required to promote to admin."
    });
  }

  const clerkClient = getClerkClient();
  const user = await clerkClient.users.getUser(req.auth.userId);
  const publicMetadata = {
    ...(user.publicMetadata || {}),
    role: "teviq_admin",
    onboarding_complete: true
  };
  const updatedUser = await clerkClient.users.updateUserMetadata(req.auth.userId, {
    publicMetadata
  });

  return res.json({
    ok: true,
    message: "Promoted to teviq_admin. Sign out and back in to activate.",
    publicMetadata: updatedUser.publicMetadata || publicMetadata
  });
}

module.exports = { getMe, setMyBrand, promoteMeToAdmin };
