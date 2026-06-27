const fs = require("fs");
const path = require("path");

const brandsDir = path.join(__dirname, "..", "data", "brands");

const REQUIRED_FIELDS = [
  "brandId",
  "brandName",
  "industry",
  "tone",
  "managerContact",
  "policies",
  "faqs",
  "widgetConfig",
  "escalationRules"
];

function isSafeBrandId(brandId) {
  return /^[a-z0-9-]+$/.test(brandId);
}

function validateBrand(brand) {
  const missingFields = REQUIRED_FIELDS.filter((field) => brand[field] == null);

  if (!Array.isArray(brand.faqs)) {
    missingFields.push("faqs[]");
  }

  if (!Array.isArray(brand.widgetConfig?.quickReplies)) {
    missingFields.push("widgetConfig.quickReplies[]");
  }

  if (!Array.isArray(brand.escalationRules?.hardKeywords)) {
    missingFields.push("escalationRules.hardKeywords[]");
  }

  return {
    valid: missingFields.length === 0,
    missingFields
  };
}

function normalizeBrand(brand) {
  return {
    ...brand,
    name: brand.brandName,
    escalationContact: brand.managerContact
  };
}

function getBrandById(brandId) {
  if (!brandId || !isSafeBrandId(brandId)) {
    return null;
  }

  const filePath = path.join(brandsDir, `${brandId}.json`);
  if (!fs.existsSync(filePath)) {
    return null;
  }

  try {
    const brand = JSON.parse(fs.readFileSync(filePath, "utf8"));
    if (brand.brandId !== brandId) {
      console.warn(
        `[brand] File ${brandId}.json has mismatched brandId: ${brand.brandId}`
      );
      return null;
    }

    const validation = validateBrand(brand);
    if (!validation.valid) {
      console.warn(
        `[brand] ${brandId} is missing required fields: ${validation.missingFields.join(", ")}`
      );
      return null;
    }

    return normalizeBrand(brand);
  } catch (error) {
    console.warn(`[brand] Failed to load ${brandId}: ${error.message}`);
    return null;
  }
}

function getPublicBrandConfig(brandId) {
  const brand = getBrandById(brandId);
  if (!brand) return null;
  const widgetConfig = brand.widgetConfig || {};

  return {
    brandName: brand.brandName,
    widgetTitle: widgetConfig.widgetTitle,
    welcomeMessage: widgetConfig.welcomeMessage,
    themeColor: widgetConfig.themeColor,
    position: widgetConfig.position,
    quickReplies: widgetConfig.quickReplies || []
  };
}

function getBrandFiles() {
  if (!fs.existsSync(brandsDir)) {
    return [];
  }

  return fs
    .readdirSync(brandsDir)
    .filter((fileName) => fileName.endsWith(".json"))
    .map((fileName) => path.join(brandsDir, fileName));
}

module.exports = {
  REQUIRED_FIELDS,
  brandsDir,
  getBrandById,
  getPublicBrandConfig,
  getBrandFiles,
  validateBrand
};
