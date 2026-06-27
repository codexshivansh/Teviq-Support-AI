const { getOrderById } = require("../services/order.service");
const { evaluatePolicy } = require("../services/policy.service");
const { buildEscalationReply, detectEscalation } = require("../services/escalation.service");
const { buildLeadCaptureReply, extractContactInfo, hasContactInfo } = require("../services/lead.service");
const {
  getRecommendedProducts,
  buildProductRecommendationReply
} = require("../services/product.service");

const ORDER_INTENTS = ["order_tracking", "return_exchange", "refund_status", "cancellation"];

function buildOrderTrackingReply(order, brand, entities) {
  if (!entities.orderId) {
    return `Please share your order ID so I can check the latest status for you.`;
  }

  if (!order) {
    return `I could not find order ${entities.orderId} for ${brand.brandName}. Please recheck the order ID or share the phone/email used at checkout.`;
  }

  const estimatedUpdate = String(order.estimatedUpdate || "No estimated update available.").replace(
    /[.。]+$/,
    ""
  );
  return `Order ${order.orderId} is currently ${order.status}. ${order.trackingText} Expected update: ${estimatedUpdate}.`;
}

function buildKnowledgeReply(brand, intent) {
  const policies = brand.policies || {};

  if (intent === "shipping_policy") {
    return policies.shipping || "Shipping details are not configured yet.";
  }

  if (intent === "payment_cod") {
    return [
      policies.cod,
      "Payment options include UPI, cards, net banking, wallets, and COD where available."
    ]
      .filter(Boolean)
      .join(" ");
  }

  if (intent === "size_help") {
    return policies.size || "Please check the product size guide. If you are between sizes, choose the larger size.";
  }

  if (intent === "discount_query") {
    return "I do not see a confirmed discount code in the current brand data. Please check the website banner or share a coupon code to verify.";
  }

  return null;
}

function routeTools({ brand, intent, entities, message }) {
  const hardEscalation = detectEscalation(message, brand);
  if (hardEscalation.escalated) {
    return {
      allowAI: false,
      source: "system",
      escalated: true,
      order: null,
      policyResult: null,
      leadState: null,
      reply: buildEscalationReply(brand)
    };
  }

  if (["human_support", "complaint", "business_enquiry"].includes(intent)) {
    return {
      allowAI: false,
      source: "system",
      escalated: intent === "complaint",
      order: null,
      policyResult: null,
      leadState: {
        contact: extractContactInfo(message),
        hasContact: hasContactInfo(message)
      },
      reply: buildLeadCaptureReply(brand, message)
    };
  }

  let order = null;
  if (ORDER_INTENTS.includes(intent) && entities.orderId) {
    order = getOrderById(entities.orderId, brand.brandId);
  }

  if (intent === "order_tracking") {
    return {
      allowAI: false,
      source: "system",
      escalated: false,
      order,
      policyResult: null,
      leadState: null,
      reply: buildOrderTrackingReply(order, brand, entities)
    };
  }

  if (["return_exchange", "refund_status", "cancellation"].includes(intent)) {
    const policyResult = evaluatePolicy({ intent, order, brand });
    return {
      allowAI: false,
      source: "system",
      escalated: false,
      order,
      policyResult,
      leadState: null,
      reply: policyResult.reply
    };
  }

  if (intent === "product_recommendation") {
    const products = getRecommendedProducts({
      brandId: brand.brandId,
      message
    });
    const recommendationReply = buildProductRecommendationReply({
      brand,
      products,
      message
    });

    if (recommendationReply) {
      return {
        allowAI: false,
        source: "system",
        escalated: false,
        order: null,
        policyResult: null,
        leadState: null,
        products,
        reply: recommendationReply
      };
    }
  }

  const knowledgeReply = buildKnowledgeReply(brand, intent);
  if (knowledgeReply) {
    return {
      allowAI: false,
      source: "system",
      escalated: false,
      order: null,
      policyResult: null,
      leadState: null,
      reply: knowledgeReply
    };
  }

  return {
    allowAI: true,
    source: null,
    escalated: false,
    order,
    policyResult: null,
    leadState: null,
    reply: null
  };
}

module.exports = { routeTools, ORDER_INTENTS };
