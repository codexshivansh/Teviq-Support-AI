// Shopify Admin API version is pinned explicitly (never "latest"/"stable") so
// that a Shopify-side quarterly API release can never silently change any
// integration built on this client underneath us.
const SHOPIFY_ADMIN_API_VERSION = "2026-07";

function getGraphQLUrl(storeHost) {
  return `https://${storeHost}/admin/api/${SHOPIFY_ADMIN_API_VERSION}/graphql.json`;
}

async function callShopifyGraphQL({ storeHost, accessToken, query, variables }) {
  let response;
  try {
    response = await fetch(getGraphQLUrl(storeHost), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": accessToken
      },
      body: JSON.stringify({ query, variables })
    });
  } catch (networkError) {
    const error = new Error(`Shopify GraphQL request failed (network error): ${networkError.message}`);
    error.code = "shopify_network_error";
    throw error;
  }

  const text = await response.text();
  const data = text ? JSON.parse(text) : null;

  if (!response.ok) {
    const error = new Error(data?.errors?.[0]?.message || `Shopify GraphQL request failed with HTTP ${response.status}`);
    error.statusCode = response.status;
    error.code = "shopify_http_error";
    error.data = data;
    throw error;
  }

  // GraphQL can return HTTP 200 with a top-level `errors` array for
  // schema/query-shape problems. This is distinct from `userErrors` inside a
  // mutation payload, which represents a business-logic rejection.
  if (data?.errors?.length) {
    const error = new Error(data.errors[0].message || "Shopify GraphQL query returned errors");
    error.code = "shopify_graphql_error";
    error.data = data.errors;
    throw error;
  }

  return data?.data;
}

module.exports = { SHOPIFY_ADMIN_API_VERSION, getGraphQLUrl, callShopifyGraphQL };
