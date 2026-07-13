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
  policyConflict,
  leadState,
  knowledge
}) {
  return {
    brand,
    publicBrandConfig: {
      brandName: brand.brandName,
      ...(brand.widgetConfig || {})
    },
    message,
    customerId,
    analysis,
    intent,
    entities,
    memory,
    order,
    policyResult,
    policyConflict,
    leadState,
    knowledge
  };
}

module.exports = { buildContext };
