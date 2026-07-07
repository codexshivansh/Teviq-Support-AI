const { createClerkClient } = require("@clerk/backend");
const fs = require("fs");
const path = require("path");
const { brandsDir, getBrandById } = require("../services/brand.service");

const BRAND_CATEGORIES = new Set([
  "Fashion",
  "Beauty",
  "Electronics",
  "Home & Living",
  "Sports",
  "Other"
]);

const SUPPORT_LANGUAGES = new Set(["Hindi", "English", "Hinglish"]);

function getClerkClient() {
  if (!process.env.CLERK_SECRET_KEY) {
    const error = new Error("Clerk secret key is not configured.");
    error.statusCode = 503;
    error.code = "auth_not_configured";
    throw error;
  }

  return createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });
}

function normalizeText(value) {
  return String(value || "").trim();
}

function slugifyBrandName(brandName) {
  return normalizeText(brandName)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
}

function buildInitialBrand({ brandId, brandName, brandCategory, supportLanguage, escalationWhatsapp }) {
  return {
    brandId,
    brandName,
    industry: brandCategory,
    tone: `${supportLanguage} first, helpful, concise, professional`,
    managerContact: {
      name: `${brandName} Support`,
      whatsapp: escalationWhatsapp || "",
      email: "",
      hours: "Business hours configured by brand owner"
    },
    policies: {
      shipping: "",
      return: "",
      exchange: "",
      cod: "",
      refund: "",
      warranty: ""
    },
    faqs: [],
    widgetConfig: {
      widgetTitle: `${brandName} Help`,
      welcomeMessage: `Welcome to ${brandName} support. I can help with orders, returns, shipping, or products.`,
      themeColor: "#0f172a",
      position: "bottom-right",
      quickReplies: [
        "Track my order",
        "Return / Exchange",
        "Shipping & Delivery",
        "Talk to Support"
      ]
    },
    escalationRules: {
      hardKeywords: [
        "fraud",
        "scam",
        "legal",
        "police",
        "consumer court",
        "abuse"
      ],
      response: "This needs priority attention. I am routing this to a senior support specialist."
    }
  };
}

function createInitialBrandFile(brand) {
  if (!fs.existsSync(brandsDir)) {
    fs.mkdirSync(brandsDir, { recursive: true });
  }

  const filePath = path.join(brandsDir, `${brand.brandId}.json`);
  if (fs.existsSync(filePath)) {
    return false;
  }

  fs.writeFileSync(filePath, JSON.stringify(brand, null, 2), { flag: "wx" });
  return true;
}

function ensureClerkSession(req, res) {
  if (!req.auth?.userId || req.auth.sessionType === "demo") {
    res.status(403).json({
      error: "clerk_session_required",
      message: "A real Clerk session is required for onboarding."
    });
    return false;
  }

  return true;
}

async function updateUserPublicMetadata(userId, updates) {
  const clerkClient = getClerkClient();
  const user = await clerkClient.users.getUser(userId);
  const publicMetadata = {
    ...(user.publicMetadata || {}),
    ...updates
  };

  const updatedUser = await clerkClient.users.updateUserMetadata(userId, {
    publicMetadata
  });

  return updatedUser.publicMetadata || publicMetadata;
}

async function saveBrandSetup(req, res, next) {
  try {
    if (!ensureClerkSession(req, res)) return;

    const brandName = normalizeText(req.body?.brandName);
    const brandCategory = normalizeText(req.body?.brandCategory);
    const supportLanguage = normalizeText(req.body?.supportLanguage);
    const escalationWhatsapp = normalizeText(req.body?.escalationWhatsapp);

    if (!brandName) {
      return res.status(400).json({
        error: "missing_brand_name",
        message: "Brand name is required."
      });
    }

    if (!BRAND_CATEGORIES.has(brandCategory)) {
      return res.status(400).json({
        error: "invalid_brand_category",
        message: "Select a valid brand category."
      });
    }

    if (!SUPPORT_LANGUAGES.has(supportLanguage)) {
      return res.status(400).json({
        error: "invalid_support_language",
        message: "Select a valid support language."
      });
    }

    const brandId = slugifyBrandName(brandName);
    if (!brandId) {
      return res.status(400).json({
        error: "invalid_brand_name",
        message: "Brand name must include letters or numbers."
      });
    }

    const brandFilePath = path.join(brandsDir, `${brandId}.json`);
    if (getBrandById(brandId) || fs.existsSync(brandFilePath)) {
      return res.status(409).json({
        error: "brand_id_conflict",
        message: "This brand ID already exists. Please use a more specific brand name."
      });
    }

    const initialBrand = buildInitialBrand({
      brandId,
      brandName,
      brandCategory,
      supportLanguage,
      escalationWhatsapp
    });

    let createdBrandFile = false;
    try {
      createdBrandFile = createInitialBrandFile(initialBrand);
      const publicMetadata = await updateUserPublicMetadata(req.auth.userId, {
        brand_name: brandName,
        brand_category: brandCategory,
        support_language: supportLanguage,
        escalation_whatsapp: escalationWhatsapp,
        brandId
      });

      return res.json({
        ok: true,
        publicMetadata
      });
    } catch (error) {
      if (createdBrandFile) {
        fs.rm(brandFilePath, { force: true }, () => {});
      }
      throw error;
    }
  } catch (error) {
    next(error);
  }
}

async function completeOnboarding(req, res, next) {
  try {
    if (!ensureClerkSession(req, res)) return;

    const publicMetadata = await updateUserPublicMetadata(req.auth.userId, {
      onboarding_complete: true
    });

    return res.json({
      ok: true,
      publicMetadata
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  BRAND_CATEGORIES: Array.from(BRAND_CATEGORIES),
  SUPPORT_LANGUAGES: Array.from(SUPPORT_LANGUAGES),
  completeOnboarding,
  saveBrandSetup,
  slugifyBrandName
};
