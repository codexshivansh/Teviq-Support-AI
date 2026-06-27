const fs = require("fs");
const path = require("path");
const {
  getBrandFiles,
  validateBrand,
  REQUIRED_FIELDS
} = require("../services/brand.service");

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function validateBrandFile(filePath) {
  const fileName = path.basename(filePath);
  const brand = readJson(filePath);
  const validation = validateBrand(brand);
  const expectedBrandId = fileName.replace(/\.json$/, "");
  const errors = [];

  if (!validation.valid) {
    errors.push(`missing fields: ${validation.missingFields.join(", ")}`);
  }

  if (brand.brandId !== expectedBrandId) {
    errors.push(`brandId must match filename (${expectedBrandId})`);
  }

  if (!brand.widgetConfig?.widgetTitle) {
    errors.push("widgetConfig.widgetTitle is required");
  }

  if (!brand.widgetConfig?.welcomeMessage) {
    errors.push("widgetConfig.welcomeMessage is required");
  }

  if (!brand.widgetConfig?.themeColor) {
    errors.push("widgetConfig.themeColor is required");
  }

  return { fileName, brandId: brand.brandId, errors };
}

function run() {
  const files = getBrandFiles();

  if (files.length === 0) {
    console.error(`FAIL no brand files found. Required fields: ${REQUIRED_FIELDS.join(", ")}`);
    process.exit(1);
  }

  let hasFailures = false;

  files.forEach((filePath) => {
    try {
      const result = validateBrandFile(filePath);

      if (result.errors.length > 0) {
        hasFailures = true;
        console.error(`FAIL ${result.fileName}: ${result.errors.join("; ")}`);
        return;
      }

      console.log(`PASS ${result.fileName} (${result.brandId})`);
    } catch (error) {
      hasFailures = true;
      console.error(`FAIL ${path.basename(filePath)}: ${error.message}`);
    }
  });

  if (hasFailures) {
    process.exit(1);
  }

  console.log(`Validated ${files.length} brand file(s).`);
}

run();
