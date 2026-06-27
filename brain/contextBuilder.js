const { getPublicBrandConfig } = require("../services/brand.service");

function buildContext({
  brand,
  message,
  customerId,
  analysis,
  intent,
  entities,
  memory,
  order,
  policyResult,
  leadState,
  knowledge
}) {
  return {
    brand,
    publicBrandConfig: getPublicBrandConfig(brand.brandId),
    message,
    customerId,
    analysis,
    intent,
    entities,
    memory,
    order,
    policyResult,
    leadState,
    knowledge
  };
}

module.exports = { buildContext };
