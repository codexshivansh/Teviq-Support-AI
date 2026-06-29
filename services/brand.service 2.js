const brands = require("../data/brands.json");
const faqs = require("../data/faqs.json");

function getBrandById(brandId) {
  return brands.find((brand) => brand.brandId === brandId) || null;
}

function getBrandFaqs(brandId) {
  return faqs.filter((faq) => faq.brandId === brandId);
}

function getPublicBrandConfig(brandId) {
  const brand = getBrandById(brandId);
  if (!brand) return null;

  return {
    brandName: brand.name,
    widgetTitle: brand.widgetTitle || `${brand.name} Support`,
    welcomeMessage:
      brand.welcomeMessage || `Hi, welcome to ${brand.name} support. How can I help?`,
    themeColor: brand.themeColor || "#101828",
    position: brand.position || "bottom-right",
    quickReplies: brand.quickReplies || []
  };
}

module.exports = { getBrandById, getBrandFaqs, getPublicBrandConfig };
