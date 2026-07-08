const { createClerkClient } = require("@clerk/backend");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { brandsDir, getBrandById } = require("../services/brand.service");

const secureDataDir = path.join(__dirname, "..", "data", "secure");
const shopifyConnectionsPath = path.join(secureDataDir, "shopify-connections.json");
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

function ensureSecureStore() {
  fs.mkdirSync(secureDataDir, { recursive: true });
  if (!fs.existsSync(shopifyConnectionsPath)) {
    fs.writeFileSync(shopifyConnectionsPath, JSON.stringify({ version: 1, connections: [] }, null, 2));
  }
}

function readShopifyConnections() {
  ensureSecureStore();
  try {
    const parsed = JSON.parse(fs.readFileSync(shopifyConnectionsPath, "utf8"));
    return {
      version: parsed.version || 1,
      connections: Array.isArray(parsed.connections) ? parsed.connections : []
    };
  } catch (error) {
    return { version: 1, connections: [] };
  }
}

function writeShopifyConnections(store) {
  ensureSecureStore();
  fs.writeFileSync(shopifyConnectionsPath, JSON.stringify(store, null, 2));
}

function getCredentialSecret() {
  const secret = process.env.SHOPIFY_CREDENTIALS_SECRET || process.env.CLERK_SECRET_KEY || "";
  if (!secret) {
    const error = new Error("Shopify credential encryption is not configured.");
    error.statusCode = 503;
    error.code = "credential_storage_not_configured";
    throw error;
  }
  return crypto.createHash("sha256").update(secret).digest();
}

function encryptValue(value) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", getCredentialSecret(), iv);
  const encrypted = Buffer.concat([cipher.update(String(value), "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return {
    algorithm: "aes-256-gcm",
    iv: iv.toString("base64"),
    authTag: authTag.toString("base64"),
    value: encrypted.toString("base64")
  };
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

function getMetadataBrandId(metadata = {}) {
  return metadata.brandId || metadata.brand_id || metadata.workspaceBrandId || metadata.workspace_brand_id || "";
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

async function getUserPublicMetadata(userId) {
  const clerkClient = getClerkClient();
  const user = await clerkClient.users.getUser(userId);
  return user.publicMetadata || {};
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

function saveShopifyConnection({ brandId, storeHost, adminAccessToken, shop }) {
  const store = readShopifyConnections();
  const now = new Date().toISOString();
  const connection = {
    brandId,
    provider: "shopify",
    storeHost,
    shopName: shop.name || storeHost,
    myshopifyDomain: shop.myshopifyDomain || storeHost,
    primaryDomainUrl: shop.primaryDomain?.url || "",
    encryptedAdminAccessToken: encryptValue(adminAccessToken),
    connectedAt: now,
    updatedAt: now
  };

  store.connections = [
    ...store.connections.filter((item) => item.brandId !== brandId),
    connection
  ];
  writeShopifyConnections(store);

  return {
    brandId,
    provider: connection.provider,
    storeHost: connection.storeHost,
    shopName: connection.shopName,
    myshopifyDomain: connection.myshopifyDomain,
    primaryDomainUrl: connection.primaryDomainUrl,
    connectedAt: connection.connectedAt
  };
}

function getStoredShopifyConnection(brandId) {
  const store = readShopifyConnections();
  const connection = store.connections.find((item) => item.brandId === brandId);
  if (!connection) return null;

  return {
    brandId,
    provider: connection.provider,
    storeHost: connection.storeHost,
    shopName: connection.shopName,
    myshopifyDomain: connection.myshopifyDomain,
    primaryDomainUrl: connection.primaryDomainUrl,
    connectedAt: connection.connectedAt,
    updatedAt: connection.updatedAt
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

    const connection = getStoredShopifyConnection(brandId);
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
    const connection = saveShopifyConnection({
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
  shopifyConnectionsPath,
  slugifyBrandName,
  testShopifyConnection
};
