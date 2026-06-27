const orders = require("../data/orders.json");

function detectOrderIntent(message) {
  return /\b(order|track|tracking|shipment|shipped|delivery|delivered|courier|awb|status)\b/i.test(
    message
  );
}

function extractOrderId(message) {
  const match = message.match(
    /(?:#|\border\s*(?:id|number|no\.?)?\s*(?:is|:)?\s*)?([a-z]{2,6}[-_\s]?\d{4,})\b/i
  );

  return match ? match[1].replace(/[-_\s]/g, "").toUpperCase() : null;
}

function getOrderById(orderId, brandId, customerId) {
  const normalizedOrderId = orderId.toUpperCase();

  return (
    orders.find((order) => {
      const sameBrand = order.brandId === brandId;
      const sameOrder = order.orderId.toUpperCase() === normalizedOrderId;
      const sameCustomer =
        !customerId ||
        customerId === "guest" ||
        customerId.startsWith("guest_") ||
        order.customerId === customerId;

      return sameBrand && sameOrder && sameCustomer;
    }) || null
  );
}

module.exports = { detectOrderIntent, extractOrderId, getOrderById };
