const { getBrandById, listBrands } = require("../services/brand.service");
const { getMetadataBrandId, getUserPublicMetadata } = require("../services/clerkMetadata.service");

async function listBrandsForCurrentUser(req, res, next) {
  try {
    if (req.auth?.sessionType === "demo") {
      const brand = await getBrandById(req.auth.brandId);
      return res.json({ ok: true, brands: brand ? [brand] : [] });
    }

    const publicMetadata = await getUserPublicMetadata(req.auth.userId);
    const isAdmin = publicMetadata.role === "teviq_admin";

    if (isAdmin) {
      const brands = await listBrands();
      return res.json({ ok: true, brands });
    }

    const assignedBrandId = getMetadataBrandId(publicMetadata);
    const brand = assignedBrandId ? await getBrandById(assignedBrandId) : null;

    return res.json({ ok: true, brands: brand ? [brand] : [] });
  } catch (error) {
    next(error);
  }
}

module.exports = { listBrandsForCurrentUser };
