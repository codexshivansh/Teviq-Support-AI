const { getAccessContext, executeGraphql } = require("./shopifyAdmin.provider");
const connectionStore = require("./shopifyConnection.store");
const { normalizeOrderId } = require("../../services/orderReference.service");

const DEMO_BRAND_IDS = new Set(["vastra-demo", "urban-demo", "beauty-demo"]);
const ORDER_VERIFICATION_FAILED_REPLY =
  "We couldn't verify this order with those details. Please check the order number and checkout email or phone, then try again. You can also talk to support.";
const ORDER_VERIFICATION_REQUIRED_REPLY =
  "To protect your order details, please share the email address or phone number used at checkout.";
const ORDER_VERIFICATION_LOCKED_REPLY =
  "Too many verification attempts. Please wait 15 minutes before trying again, or talk to support.";

const VERIFY_ORDER_CONTACT_QUERY = `query TeviqVerifyOrderContact($query: String!) {
  orders(first: 2, query: $query) {
    nodes {
      id
      name
      email
      phone
    }
  }
}`;

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizePhone(value) {
  const digits = String(value || "").replace(/\D/g, "");
  if (!digits) return "";
  return digits.length > 10 ? digits.slice(-10) : digits;
}

function contactMatches(order, { email, phone }) {
  const suppliedEmail = normalizeEmail(email);
  const suppliedPhone = normalizePhone(phone);
  const orderEmail = normalizeEmail(order.email);
  const orderPhone = normalizePhone(order.phone);

  return Boolean(
    (suppliedEmail && orderEmail && suppliedEmail === orderEmail) ||
      (suppliedPhone && orderPhone && suppliedPhone === orderPhone)
  );
}

async function getOrderVerificationRequirement(brandId) {
  if (DEMO_BRAND_IDS.has(brandId)) {
    return { required: false, available: true };
  }

  try {
    const connection = await connectionStore.getConnectionByBrandId(brandId);
    // Every non-demo brand is fail-closed. A disconnected store can still
    // have stale cached orders, so skipping verification here would expose
    // those records to anyone who guesses an order number.
    if (!connection) return { required: true, available: false };
    return { required: true, available: connection.status === "active" };
  } catch {
    return { required: true, available: false };
  }
}

async function verifyOrderContact({ brandId, orderId, email, phone }) {
  if ((!email && !phone) || !orderId) {
    return { verified: false, status: "not_verified" };
  }

  try {
    const normalizedOrderId = normalizeOrderId(orderId);
    const orderNameFilter = normalizedOrderId.startsWith("#")
      ? normalizedOrderId.slice(1)
      : normalizedOrderId;
    const context = await getAccessContext(brandId);
    const data = await executeGraphql({
      ...context,
      query: VERIFY_ORDER_CONTACT_QUERY,
      variables: { query: `name:${JSON.stringify(orderNameFilter)}` }
    });
    const order = (data.orders?.nodes || []).find(
      (candidate) => normalizeOrderId(candidate.name) === normalizedOrderId
    );

    if (!order || !contactMatches(order, { email, phone })) {
      return { verified: false, status: "not_verified" };
    }

    return {
      verified: true,
      status: "verified",
      shopifyOrderId: order.id,
      orderId: order.name
    };
  } catch (error) {
    return {
      verified: false,
      status: "unavailable",
      errorCode: error.code || "shopify_verification_unavailable"
    };
  }
}

module.exports = {
  ORDER_VERIFICATION_FAILED_REPLY,
  ORDER_VERIFICATION_LOCKED_REPLY,
  ORDER_VERIFICATION_REQUIRED_REPLY,
  VERIFY_ORDER_CONTACT_QUERY,
  contactMatches,
  getOrderVerificationRequirement,
  normalizeEmail,
  normalizePhone,
  verifyOrderContact
};
