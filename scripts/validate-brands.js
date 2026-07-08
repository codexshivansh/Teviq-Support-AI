const {
  REQUIRED_FIELDS,
  listBrands,
  validateBrand
} = require("../services/brand.service");

async function run() {
  const brands = await listBrands();

  if (brands.length === 0) {
    console.error(`FAIL no brands found in Supabase. Required fields: ${REQUIRED_FIELDS.join(", ")}`);
    process.exit(1);
  }

  let hasFailures = false;

  brands.forEach((brand) => {
    const row = {
      id: brand.brandId,
      brand_name: brand.brandName,
      brand_category: brand.industry,
      support_language: brand.supportLanguage,
      is_active: brand.isActive
    };
    const validation = validateBrand(row);

    if (!validation.valid) {
      hasFailures = true;
      console.error(`FAIL ${brand.brandId}: missing fields: ${validation.missingFields.join(", ")}`);
      return;
    }

    console.log(`PASS ${brand.brandId} (${brand.brandName})`);
  });

  if (hasFailures) {
    process.exit(1);
  }

  console.log(`Validated ${brands.length} Supabase brand row(s).`);
}

run().catch((error) => {
  console.error("FAIL brand validation:", error.message);
  process.exit(1);
});
