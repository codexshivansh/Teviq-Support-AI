const { brandExists, createBrand, deleteBrand, getBrandById, updateBrand } = require("../services/brand.service");
const { getClerkClient, getMetadataBrandId, getUserPublicMetadata } = require("../services/clerkMetadata.service");
const { encryptValue } = require("../services/shopifyCredentials.service");

const SHOPIFY_ADMIN_API_VERSION = process.env.SHOPIFY_ADMIN_API_VERSION || "2024-10";

const BRAND_CATEGORIES = new Set([
  "Fashion",
  "Beauty",
  "Electronics",
  "Home & Living",
  "Sports",
  "Other"
]);

const SUPPORT_LANGUAGES = new Set(["Hindi", "English", "Hinglish"]);

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

async function ensureBrandAccess(req, res, brandId) {
  const publicMetadata = await getUserPublicMetadata(req.auth.userId);
  const isAdmin = publicMetadata.role === "teviq_admin";
  const assignedBrandId = getMetadataBrandId(publicMetadata);

  if (!isAdmin && assignedBrandId !== brandId) {
    res.status(403).json({
      error: "brand_access_denied",
      message: "You do not have access to this brand workspace."
    });
    return null;
  }

  return publicMetadata;
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

function normalizeShopifyStoreUrl(value) {
  const rawValue = normalizeText(value);
  if (!rawValue) return "";

  const withProtocol = /^https?:\/\//i.test(rawValue) ? rawValue : `https://${rawValue}`;
  try {
    const url = new URL(withProtocol);
    return url.hostname.toLowerCase().replace(/^www\./, "");
  } catch (error) {
    return "";
  }
}

async function validateShopifyCredentials({ storeHost, adminAccessToken }) {
  const endpoint = `https://${storeHost}/admin/api/${SHOPIFY_ADMIN_API_VERSION}/graphql.json`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": adminAccessToken
    },
    body: JSON.stringify({
      query: `query TeviqConnectionTest {
        shop {
          name
          myshopifyDomain
          primaryDomain {
            url
          }
        }
      }`
    })
  });

  const data = await response.json().catch(() => null);
  if (!response.ok || data?.errors?.length) {
    const detail = data?.errors?.[0]?.message || `Shopify returned HTTP ${response.status}`;
    const error = new Error(`Could not validate Shopify credentials. ${detail}`);
    error.statusCode = 400;
    error.code = "shopify_connection_failed";
    throw error;
  }

  return data?.data?.shop || {};
}

async function saveShopifyConnection({ brandId, storeHost, adminAccessToken, shop }) {
  const now = new Date().toISOString();
  const encryptedToken = encryptValue(adminAccessToken);

  await updateBrand(brandId, {
    shopify_store_url: storeHost,
    shopify_token_encrypted: JSON.stringify(encryptedToken)
  });

  return {
    brandId,
    provider: "shopify",
    storeHost,
    shopName: shop.name || storeHost,
    myshopifyDomain: shop.myshopifyDomain || storeHost,
    primaryDomainUrl: shop.primaryDomain?.url || "",
    connectedAt: now
  };
}

async function getStoredShopifyConnection(brandId) {
  const brand = await getBrandById(brandId);
  if (!brand?.shopifyStoreUrl || !brand?.shopifyTokenEncrypted) return null;

  return {
    brandId,
    provider: "shopify",
    storeHost: brand.shopifyStoreUrl,
    shopName: brand.shopifyStoreUrl,
    myshopifyDomain: brand.shopifyStoreUrl,
    primaryDomainUrl: "",
    connectedAt: null,
    updatedAt: null
  };
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

    if (await brandExists(brandId)) {
      return res.status(409).json({
        error: "brand_id_conflict",
        message: "This brand ID already exists. Please use a more specific brand name."
      });
    }

    let createdBrand = false;
    try {
      await createBrand({
        id: brandId,
        brand_name: brandName,
        brand_category: brandCategory,
        support_language: supportLanguage,
        escalation_whatsapp: escalationWhatsapp,
        is_active: true
      });
      createdBrand = true;

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
      if (createdBrand) {
        await deleteBrand(brandId).catch((rollbackError) => {
          console.warn(`[onboarding] Failed to rollback brand ${brandId}: ${rollbackError.message}`);
        });
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

async function getShopifyConnectionStatus(req, res, next) {
  try {
    if (!ensureClerkSession(req, res)) return;

    const brandId = normalizeText(req.query?.brandId);
    if (!brandId || !/^[a-z0-9-]+$/.test(brandId)) {
      return res.status(400).json({
        error: "invalid_brand_id",
        message: "A valid brandId is required."
      });
    }

    const metadata = await ensureBrandAccess(req, res, brandId);
    if (!metadata) return;

    const connection = await getStoredShopifyConnection(brandId);
    return res.json({
      ok: true,
      connected: Boolean(connection),
      connection
    });
  } catch (error) {
    next(error);
  }
}

async function testShopifyConnection(req, res, next) {
  try {
    if (!ensureClerkSession(req, res)) return;

    const brandId = normalizeText(req.body?.brandId);
    const storeHost = normalizeShopifyStoreUrl(req.body?.storeUrl);
    const adminAccessToken = normalizeText(req.body?.adminAccessToken);

    if (!brandId || !/^[a-z0-9-]+$/.test(brandId)) {
      return res.status(400).json({
        error: "invalid_brand_id",
        message: "A valid brandId is required."
      });
    }

    const metadata = await ensureBrandAccess(req, res, brandId);
    if (!metadata) return;

    if (!storeHost) {
      return res.status(400).json({
        error: "invalid_store_url",
        message: "Enter a valid Shopify store URL."
      });
    }

    if (!adminAccessToken) {
      return res.status(400).json({
        error: "missing_admin_access_token",
        message: "Admin API Access Token is required."
      });
    }

    const shop = await validateShopifyCredentials({ storeHost, adminAccessToken });
    const connection = await saveShopifyConnection({
      brandId,
      storeHost,
      adminAccessToken,
      shop
    });

    return res.json({
      ok: true,
      connected: true,
      connection
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  BRAND_CATEGORIES: Array.from(BRAND_CATEGORIES),
  SUPPORT_LANGUAGES: Array.from(SUPPORT_LANGUAGES),
  completeOnboarding,
  getShopifyConnectionStatus,
  saveBrandSetup,
  slugifyBrandName,
  testShopifyConnection
};
