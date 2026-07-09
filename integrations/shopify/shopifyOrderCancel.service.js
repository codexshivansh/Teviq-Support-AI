const { callShopifyGraphQL } = require("./shopifyGraphQLClient");

// `orderCancel` has no request/approval-gated counterpart (unlike returns,
// where `returnRequest` exists alongside `returnCreate`) — calling this
// mutation cancels the order immediately (processed async as a Job, but the
// decision itself is made the moment this call succeeds). There is no
// Shopify-side review step to lean on here, unlike the return flow.
async function cancelOrder({ storeHost, accessToken, orderId, reason, restock, refundMethod, notifyCustomer }) {
  const mutation = `
    mutation CancelOrder(
      $orderId: ID!
      $reason: OrderCancelReason!
      $restock: Boolean!
      $refundMethod: OrderCancelRefundMethodInput
      $notifyCustomer: Boolean
    ) {
      orderCancel(
        orderId: $orderId
        reason: $reason
        restock: $restock
        refundMethod: $refundMethod
        notifyCustomer: $notifyCustomer
      ) {
        job {
          id
          done
        }
        orderCancelUserErrors {
          field
          message
          code
        }
      }
    }
  `;

  const variables = {
    orderId,
    reason,
    restock,
    refundMethod: refundMethod || undefined,
    notifyCustomer: Boolean(notifyCustomer)
  };

  const data = await callShopifyGraphQL({ storeHost, accessToken, query: mutation, variables });
  const result = data?.orderCancel;
  const userErrors = result?.orderCancelUserErrors || [];

  // Same distinction as the returns integration: userErrors is Shopify's
  // business-logic failure channel and can be present even on a healthy
  // HTTP 200 / error-free GraphQL envelope.
  if (userErrors.length) {
    const error = new Error(userErrors.map((item) => item.message).join("; "));
    error.code = "shopify_order_cancel_rejected";
    error.userErrors = userErrors;
    throw error;
  }

  if (!result?.job) {
    const error = new Error("Shopify orderCancel mutation returned neither a job nor userErrors.");
    error.code = "shopify_unexpected_response";
    throw error;
  }

  return {
    shopifyJobId: result.job.id,
    jobDone: result.job.done
  };
}

module.exports = { cancelOrder };
