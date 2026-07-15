const { getOrderById } = require("../services/order.service");
const { evaluatePolicy } = require("../services/policy.service");
const { buildEscalationReply, detectEscalation } = require("../services/escalation.service");
const { buildLeadCaptureReply, extractContactInfo, hasContactInfo } = require("../services/lead.service");
const {
  getRecommendedProducts,
  buildProductRecommendationReply,
  detectCategory
} = require("../services/product.service");
const {
  ORDER_VERIFICATION_FAILED_REPLY,
  ORDER_VERIFICATION_LOCKED_REPLY,
  ORDER_VERIFICATION_REQUIRED_REPLY,
  getOrderVerificationRequirement,
  verifyOrderContact
} = require("../integrations/shopify/shopifyOrderVerification.service");

const ORDER_INTENTS = ["order_tracking", "return_exchange", "refund_status", "cancellation"];
const LEAD_CAPTURE_INTENTS = ["human_support", "business_enquiry"];

function orderVerificationResult(status, orderId, reply) {
  return {
    allowAI: false,
    source: "system",
    escalated: false,
    order: null,
    policyResult: null,
    leadState: null,
    orderVerification: { status, orderId },
    reply
  };
}

function buildOrderTrackingReply(order, brand, entities) {
  if (!entities.orderId) {
    return `Please share your order ID so I can check the latest status for you.`;
  }

  if (!order) {
    return `I could not find order ${entities.orderId} for ${brand.brandName}. Please recheck the order ID or share the phone/email used at checkout.`;
  }

  const replyParts = [`Order ${order.orderId} is currently ${order.status}.`];
  if (order.trackingText) replyParts.push(order.trackingText);
  if (order.estimatedUpdate) replyParts.push(`Expected update: ${order.estimatedUpdate}`);
  return replyParts.join(" ");
}

function buildProductNarrowingQuestion() {
  return "Bataiye aapko kis type ka product chahiye (jaise category) ya aapka budget kitna hai — main us hisaab se best options suggest kar sakta hoon.";
}

function buildKnowledgeReply(brand, intent) {
  if (intent === "discount_query") {
    return "I do not see a confirmed discount code in the current brand data. Please check the website banner or share a coupon code to verify.";
  }

  return null;
}

function getIntentFallbackReply(brand, intent) {
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

  return null;
}

async function routeTools({ brand, intent, entities, message }) {
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

  if (intent === "subjective_opinion") {
    return {
      allowAI: false,
      source: "system",
      escalated: false,
      order: null,
      policyResult: null,
      leadState: null,
      reply:
        "Bahut se D2C brands isse repetitive queries handle karne ke liye use karte hain — 7-day free trial hai, khud try karke dekh sakte ho risk-free."
    };
  }

  if (LEAD_CAPTURE_INTENTS.includes(intent)) {
    return {
      allowAI: false,
      source: "system",
      escalated: intent === "human_support",
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
  let orderVerification = null;
  if (ORDER_INTENTS.includes(intent) && entities.orderId) {
    const requirement = await getOrderVerificationRequirement(brand.brandId);

    if (requirement.required && entities.orderVerificationLocked) {
      return orderVerificationResult(
        "locked",
        entities.orderId,
        ORDER_VERIFICATION_LOCKED_REPLY
      );
    }

    if (requirement.required && !entities.orderVerified) {
      if (!requirement.available) {
        return orderVerificationResult(
          "unavailable",
          entities.orderId,
          ORDER_VERIFICATION_FAILED_REPLY
        );
      }

      if (!entities.email && !entities.phone) {
        return orderVerificationResult(
          "required",
          entities.orderId,
          ORDER_VERIFICATION_REQUIRED_REPLY
        );
      }

      const verification = await verifyOrderContact({
        brandId: brand.brandId,
        orderId: entities.orderId,
        email: entities.email,
        phone: entities.phone
      });

      if (!verification.verified) {
        return orderVerificationResult(
          verification.status === "unavailable" ? "unavailable" : "failed",
          entities.orderId,
          ORDER_VERIFICATION_FAILED_REPLY
        );
      }

      orderVerification = verification;
    } else if (requirement.required) {
      orderVerification = { status: "verified", orderId: entities.orderId };
    }

    order = await getOrderById(entities.orderId, brand.brandId);

    if (requirement.required && !order) {
      return orderVerificationResult(
        "unavailable",
        entities.orderId,
        ORDER_VERIFICATION_FAILED_REPLY
      );
    }
  }

  if (intent === "order_tracking") {
    return {
      allowAI: false,
      source: "system",
      escalated: false,
      order,
      policyResult: null,
      leadState: null,
      orderVerification,
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
      orderVerification,
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

    // No keyword match and no budget in this message — ask a narrowing
    // question instead of falling through to Knowledge Brain/AI, which has
    // no product catalog coverage (see knowledge/retrieval.service.js).
    return {
      allowAI: false,
      source: "system",
      escalated: false,
      order: null,
      policyResult: null,
      leadState: null,
      products: [],
      needsProductNarrowing: true,
      detectedCategory: detectCategory(brand.brandId, message),
      reply: buildProductNarrowingQuestion()
    };
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
    reply: null,
    fallbackReply: getIntentFallbackReply(brand, intent)
  };
}

module.exports = { routeTools, ORDER_INTENTS, LEAD_CAPTURE_INTENTS };
