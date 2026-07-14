const { getShopifyConfig } = require("./shopifyConfig");
const connectionStore = require("./shopifyConnection.store");
const shopifyAdminProvider = require("./shopifyAdmin.provider");

const OPERATIONAL_SUBSCRIPTIONS = [
  { topic: "PRODUCTS_CREATE", requiredScope: "read_products" },
  { topic: "PRODUCTS_UPDATE", requiredScope: "read_products" },
  { topic: "PRODUCTS_DELETE", requiredScope: "read_products" },
  { topic: "ORDERS_CREATE", requiredScope: "read_orders" },
  { topic: "ORDERS_UPDATED", requiredScope: "read_orders" },
  { topic: "ORDERS_CANCELLED", requiredScope: "read_orders" },
  { topic: "FULFILLMENTS_CREATE", requiredScope: "read_fulfillments" },
  { topic: "FULFILLMENTS_UPDATE", requiredScope: "read_fulfillments" },
  { topic: "APP_UNINSTALLED", requiredScope: null }
];

const LIST_SUBSCRIPTIONS_QUERY = `query TeviqWebhookSubscriptions($first: Int!) {
  webhookSubscriptions(first: $first) {
    nodes { id topic uri }
  }
}`;

const CREATE_SUBSCRIPTION_MUTATION = `mutation TeviqCreateWebhookSubscription(
  $topic: WebhookSubscriptionTopic!,
  $webhookSubscription: WebhookSubscriptionInput!
) {
  webhookSubscriptionCreate(topic: $topic, webhookSubscription: $webhookSubscription) {
    webhookSubscription { id topic uri }
    userErrors { field message }
  }
}`;

const DELETE_SUBSCRIPTION_MUTATION = `mutation TeviqDeleteWebhookSubscription($id: ID!) {
  webhookSubscriptionDelete(id: $id) {
    deletedWebhookSubscriptionId
    userErrors { field message }
  }
}`;

function webhookUri() {
  const { publicApiUrl } = getShopifyConfig();
  return `${publicApiUrl}/api/integrations/shopify/webhooks`;
}

async function listSubscriptions(context) {
  const data = await shopifyAdminProvider.executeGraphql({
    ...context,
    query: LIST_SUBSCRIPTIONS_QUERY,
    variables: { first: 100 }
  });
  return data.webhookSubscriptions?.nodes || [];
}

async function createSubscription(context, topic, uri) {
  const data = await shopifyAdminProvider.executeGraphql({
    ...context,
    query: CREATE_SUBSCRIPTION_MUTATION,
    variables: { topic, webhookSubscription: { uri } }
  });
  const result = data.webhookSubscriptionCreate || {};
  if (result.userErrors?.length) {
    throw new Error(result.userErrors.map((item) => item.message).join(" "));
  }
  return result.webhookSubscription;
}

async function deleteSubscription(context, id) {
  const data = await shopifyAdminProvider.executeGraphql({
    ...context,
    query: DELETE_SUBSCRIPTION_MUTATION,
    variables: { id }
  });
  const errors = data.webhookSubscriptionDelete?.userErrors || [];
  if (errors.length) throw new Error(errors.map((item) => item.message).join(" "));
}

async function ensureOperationalSubscriptions(brandId) {
  const context = await shopifyAdminProvider.getAccessContext(brandId);
  const uri = webhookUri();
  const grantedScopes = new Set(context.connection.scopes || []);
  const eligible = OPERATIONAL_SUBSCRIPTIONS.filter(
    (item) => !item.requiredScope || grantedScopes.has(item.requiredScope)
  );
  const missingScopes = Array.from(new Set(
    OPERATIONAL_SUBSCRIPTIONS
      .filter((item) => item.requiredScope && !grantedScopes.has(item.requiredScope))
      .map((item) => item.requiredScope)
  ));
  const existing = await listSubscriptions(context);
  const existingKeys = new Set(existing.map((item) => `${item.topic}|${item.uri}`));
  const created = [];
  const errors = [];

  for (const subscription of eligible) {
    const key = `${subscription.topic}|${uri}`;
    if (existingKeys.has(key)) continue;
    try {
      const result = await createSubscription(context, subscription.topic, uri);
      if (result) created.push(result.topic);
    } catch (error) {
      errors.push(`${subscription.topic}: ${error.message}`);
    }
  }

  const status = errors.length ? "error" : missingScopes.length ? "partial" : "ready";
  await connectionStore.updateConnection(brandId, {
    webhooks_status: status,
    webhooks_last_registered_at: new Date().toISOString(),
    webhooks_last_error: errors.length
      ? errors.join(" ").slice(0, 500)
      : missingScopes.length
        ? `Reconnect Shopify with: ${missingScopes.join(", ")}`
        : null
  });

  return { status, created, missingScopes, errors };
}

async function removeOperationalSubscriptions(brandId) {
  const context = await shopifyAdminProvider.getAccessContext(brandId);
  const uri = webhookUri();
  const subscriptions = (await listSubscriptions(context)).filter((item) => item.uri === uri);
  const errors = [];

  for (const subscription of subscriptions) {
    try {
      await deleteSubscription(context, subscription.id);
    } catch (error) {
      errors.push(`${subscription.topic}: ${error.message}`);
    }
  }

  return { removed: subscriptions.length - errors.length, errors };
}

module.exports = {
  OPERATIONAL_SUBSCRIPTIONS,
  createSubscription,
  ensureOperationalSubscriptions,
  listSubscriptions,
  removeOperationalSubscriptions,
  webhookUri
};
