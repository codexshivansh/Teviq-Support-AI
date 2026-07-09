const { SHOPIFY_ADMIN_API_VERSION, callShopifyGraphQL } = require("./shopifyGraphQLClient");

async function fetchFulfillmentLineItems({ storeHost, accessToken, orderId }) {
  const query = `
    query FulfillmentLineItemsForOrder($orderId: ID!) {
      order(id: $orderId) {
        id
        name
        returnStatus
        fulfillments(first: 20) {
          id
          status
          lineItems(first: 50) {
            edges {
              node {
                id
                quantity
                lineItem {
                  id
                  title
                  variantTitle
                  sku
                }
              }
            }
          }
        }
      }
    }
  `;

  const data = await callShopifyGraphQL({ storeHost, accessToken, query, variables: { orderId } });
  const order = data?.order;

  if (!order) {
    const error = new Error(`Order ${orderId} not found in Shopify.`);
    error.code = "shopify_order_not_found";
    throw error;
  }

  const fulfillmentLineItems = (order.fulfillments || []).flatMap((fulfillment) =>
    (fulfillment.lineItems?.edges || []).map((edge) => ({
      fulfillmentLineItemId: edge.node.id,
      quantity: edge.node.quantity,
      title: edge.node.lineItem?.title,
      variantTitle: edge.node.lineItem?.variantTitle,
      sku: edge.node.lineItem?.sku,
      fulfillmentId: fulfillment.id,
      fulfillmentStatus: fulfillment.status
    }))
  );

  return {
    orderId: order.id,
    orderName: order.name,
    returnStatus: order.returnStatus,
    fulfillmentLineItems
  };
}

// Uses `returnRequest`, not `returnCreate`. `returnRequest` creates a return
// in Shopify's REQUESTED state, awaiting merchant approval/decline via
// returnApproveRequest/returnDeclineRequest. `returnCreate` immediately opens
// an approved return with no review step — using it here would mean the bot
// itself approves the return, which conflicts with ARCHITECTURE_V2.md's
// "AI should not decide policies alone" rule. `returnRequest` keeps a human
// (or a later, explicit approval step) in the loop.
async function createReturnRequest({ storeHost, accessToken, orderId, lineItems, reasonDefinitionId, customerNote }) {
  const mutation = `
    mutation CreateReturnRequest($input: ReturnRequestInput!) {
      returnRequest(input: $input) {
        return {
          id
          status
        }
        userErrors {
          field
          message
        }
      }
    }
  `;

  const returnLineItems = (lineItems || []).map((item) => ({
    fulfillmentLineItemId: item.fulfillmentLineItemId,
    quantity: item.quantity,
    returnReasonDefinitionId: reasonDefinitionId,
    customerNote: customerNote || undefined
  }));

  const variables = {
    input: {
      orderId,
      returnLineItems
    }
  };

  const data = await callShopifyGraphQL({ storeHost, accessToken, query: mutation, variables });
  const result = data?.returnRequest;
  const userErrors = result?.userErrors || [];

  // userErrors is Shopify's business-logic failure channel — the HTTP
  // response and GraphQL envelope can both be perfectly healthy (200, no
  // `errors`) while the mutation itself was rejected (e.g. line item already
  // returned, invalid reason ID). Must be checked explicitly and separately
  // from transport-level failures.
  if (userErrors.length) {
    const error = new Error(userErrors.map((item) => item.message).join("; "));
    error.code = "shopify_return_request_rejected";
    error.userErrors = userErrors;
    throw error;
  }

  if (!result?.return) {
    const error = new Error("Shopify returnRequest mutation returned neither a return object nor userErrors.");
    error.code = "shopify_unexpected_response";
    throw error;
  }

  return {
    shopifyReturnId: result.return.id,
    status: result.return.status
  };
}

module.exports = {
  SHOPIFY_ADMIN_API_VERSION,
  fetchFulfillmentLineItems,
  createReturnRequest
};
