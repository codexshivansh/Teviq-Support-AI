const { getBrandById, listBrands } = require("../services/brand.service");
const { getMetadataBrandId, getUserPublicMetadata } = require("../services/clerkMetadata.service");

// Slim, public-safe projection — the workspace switcher only needs enough to
// render a list. Full brand rows carry shopifyTokenEncrypted, policies, FAQs
// and contact info that the dashboard shell has no reason to receive.
function toWorkspaceSummary(brand) {
  return {
    id: brand.id,
    name: brand.brandName,
    industry: brand.industry,
    themeColor: brand.widgetConfig?.themeColor || "#0f172a"
  };
}

async function listBrandsForCurrentUser(req, res, next) {
  try {
    if (req.auth?.sessionType === "demo") {
      const brand = await getBrandById(req.auth.brandId);
      return res.json({ ok: true, brands: brand ? [toWorkspaceSummary(brand)] : [] });
    }

    const publicMetadata = await getUserPublicMetadata(req.auth.userId);
    const isAdmin = publicMetadata.role === "teviq_admin";

    if (isAdmin) {
      const brands = await listBrands();
      return res.json({ ok: true, brands: brands.map(toWorkspaceSummary) });
    }

    const assignedBrandId = getMetadataBrandId(publicMetadata);
    const brand = assignedBrandId ? await getBrandById(assignedBrandId) : null;

    return res.json({ ok: true, brands: brand ? [toWorkspaceSummary(brand)] : [] });
  } catch (error) {
    next(error);
  }
}

module.exports = { listBrandsForCurrentUser };
