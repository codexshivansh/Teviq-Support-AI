function evaluateReturnExchange({ intent, order, brand }) {
  if (!order) {
    return {
      allowed: false,
      reason: "missing_order",
      reply: `Please share your order ID so I can check ${intent === "return_exchange" ? "return or exchange" : "eligibility"} for you.`
    };
  }

  if (order.status !== "Delivered") {
    return {
      allowed: false,
      reason: "not_delivered",
      reply: `Your order ${order.orderId} is currently ${order.status}. Return or exchange can be checked only after delivery.`
    };
  }

  return {
    allowed: true,
    reason: "delivered",
    reply: `Your order ${order.orderId} is Delivered, so return or exchange can be checked as per ${brand.brandName}'s policy. Please keep the item unused with original packaging.`
  };
}

function evaluateCancellation({ order }) {
  if (!order) {
    return {
      allowed: false,
      reason: "missing_order",
      reply: "Please share your order ID so I can check whether cancellation is possible."
    };
  }

  if (order.status === "Processing") {
    return {
      allowed: true,
      reason: "processing",
      reply: `Order ${order.orderId} is Processing, so cancellation can be requested now. Final confirmation will come from the support team.`
    };
  }

  return {
    allowed: false,
    reason: "not_processing",
    reply: `Order ${order.orderId} is currently ${order.status}. Cancellation is only available while the order is Processing.`
  };
}

function evaluateRefund({ order, brand }) {
  if (!order) {
    return {
      allowed: false,
      reason: "missing_order",
      reply: "Please share your order ID so I can guide you on refund status."
    };
  }

  if (order.status !== "Delivered") {
    return {
      allowed: false,
      reason: "not_delivered",
      reply: `Your order ${order.orderId} is currently ${order.status}. Refund guidance can be checked after delivery and return approval.`
    };
  }

  return {
    allowed: false,
    reason: "guidance_only",
    reply: `For order ${order.orderId}, refunds depend on ${brand.brandName}'s return approval and quality check. I cannot confirm a refund until the team approves it.`
  };
}

function evaluatePolicy({ intent, order, brand }) {
  if (intent === "return_exchange") {
    return evaluateReturnExchange({ intent, order, brand });
  }

  if (intent === "cancellation") {
    return evaluateCancellation({ order, brand });
  }

  if (intent === "refund_status") {
    return evaluateRefund({ order, brand });
  }

  return null;
}

module.exports = {
  evaluatePolicy,
  evaluateReturnExchange,
  evaluateCancellation,
  evaluateRefund
};
