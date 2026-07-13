const { getBrandById, listBrands, updateBrand } = require("../services/brand.service");
const { getMetadataBrandId, getUserPublicMetadata } = require("../services/clerkMetadata.service");

const HEX_COLOR_PATTERN = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;

// Editable-settings projection — everything the Settings page needs to
// display and save, minus Shopify secrets and internal ranking data.
function toEditableSettings(brand) {
  return {
    id: brand.brandId,
    brandName: brand.brandName,
    industry: brand.brandCategory,
    themeColor: brand.widgetConfig?.themeColor || "#0f172a",
    welcomeMessage: brand.widgetConfig?.welcomeBody || "",
    quickActions: (brand.widgetConfig?.quickReplies || []).map((reply) => reply.label),
    supportPhone: brand.contact?.phone || "",
    supportEmail: brand.contact?.email || "",
    businessHours: brand.businessHours || ""
  };
}

function normalizeText(value) {
  return typeof value === "string" ? value.trim() : "";
}

// Slim, public-safe projection — the workspace switcher only needs enough to
// render a list. Full brand rows carry shopifyTokenEncrypted, policies, FAQs
// and contact info that the dashboard shell has no reason to receive.
function toWorkspaceSummary(brand) {
  return {
    id: brand.brandId,
    name: brand.brandName,
    industry: brand.brandCategory,
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

async function getBrandSettings(req, res, next) {
  try {
    const brand = await getBrandById(req.params.brandId);
    if (!brand) {
      return res.status(404).json({ error: "brand_not_found", message: "Brand not found." });
    }

    return res.json({ ok: true, settings: toEditableSettings(brand) });
  } catch (error) {
    next(error);
  }
}

async function updateBrandSettings(req, res, next) {
  try {
    const brandId = req.params.brandId;
    const existing = await getBrandById(brandId);
    if (!existing) {
      return res.status(404).json({ error: "brand_not_found", message: "Brand not found." });
    }

    const body = req.body || {};
    const updates = {};

    if (body.welcomeMessage !== undefined) {
      updates.welcome_body = normalizeText(body.welcomeMessage) || null;
    }

    if (body.quickActions !== undefined) {
      if (!Array.isArray(body.quickActions)) {
        return res.status(400).json({ error: "invalid_quick_actions", message: "quickActions must be a list." });
      }
      updates.quick_replies = body.quickActions
        .map((label) => normalizeText(label))
        .filter(Boolean)
        .map((label) => ({ label, message: label }));
    }

    if (body.supportPhone !== undefined) {
      updates.contact_phone = normalizeText(body.supportPhone) || null;
    }

    if (body.supportEmail !== undefined) {
      updates.contact_email = normalizeText(body.supportEmail) || null;
    }

    if (body.businessHours !== undefined) {
      updates.business_hours = normalizeText(body.businessHours) || null;
    }

    if (body.themeColor !== undefined) {
      const themeColor = normalizeText(body.themeColor);
      if (themeColor && !HEX_COLOR_PATTERN.test(themeColor)) {
        return res.status(400).json({ error: "invalid_theme_color", message: "themeColor must be a hex color like #0f172a." });
      }
      updates.theme_color = themeColor || null;
    }

    const updated = await updateBrand(brandId, updates);
    return res.json({ ok: true, settings: toEditableSettings(updated) });
  } catch (error) {
    next(error);
  }
}

module.exports = { listBrandsForCurrentUser, getBrandSettings, updateBrandSettings };
