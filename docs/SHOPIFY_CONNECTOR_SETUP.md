# Shopify Connector Setup

Teviq now supports a brand-scoped Shopify OAuth connection alongside the existing JSON demo connector. Client workspaces authorize the Teviq app in Shopify; they never paste Admin API access tokens into the dashboard.

## Shopify app configuration

1. Create the Teviq app in the Shopify Dev Dashboard.
2. Use public distribution when onboarding unrelated client stores.
3. Add this allowed redirection URL:

   `https://teviq-support-ai-backend.onrender.com/api/integrations/shopify/oauth/callback`

4. Request the minimum current scopes:

   `read_products,read_orders,read_fulfillments`

5. Set the Webhooks API version to `2026-07`.

6. Configure protected customer data access in Shopify before using order data with production merchants.

Official references:

- [Shopify authorization code grant](https://shopify.dev/docs/apps/build/authentication-authorization/access-tokens/authorization-code-grant)
- [Shopify offline access tokens](https://shopify.dev/docs/apps/build/authentication-authorization/access-tokens/offline-access-tokens)
- [Shopify app distribution](https://shopify.dev/docs/apps/launch/distribution)

## Render environment variables

```env
SHOPIFY_CLIENT_ID=<Shopify app client ID>
SHOPIFY_CLIENT_SECRET=<Shopify app client secret>
SHOPIFY_CREDENTIALS_SECRET=<independent long random encryption secret>
SHOPIFY_SCOPES=read_products,read_orders,read_fulfillments
SHOPIFY_ADMIN_API_VERSION=2026-07
SHOPIFY_REDIRECT_URI=https://teviq-support-ai-backend.onrender.com/api/integrations/shopify/oauth/callback
PUBLIC_API_URL=https://teviq-support-ai-backend.onrender.com
DASHBOARD_URL=https://dashboard.teviq.in
SHOPIFY_PRODUCT_SYNC_MAX_PAGES=50
SHOPIFY_ORDER_SYNC_MAX_PAGES=20
```

Do not reuse or expose the Supabase service-role key, Shopify client secret, or credential-encryption secret in the dashboard.

## Data model

- `shopify_connections` stores one encrypted, brand-scoped offline connection per Shopify store.
- `shopify_oauth_states` stores hashed, one-time OAuth state for ten minutes.
- `shopify_products` and `shopify_orders` store an allowlisted support cache. Customer email, phone and address data are not copied into these tables.
- `shopify_webhook_events` stores webhook IDs and processing status for idempotency. Raw webhook payloads are not retained.
- All Shopify tables have RLS enabled and no browser-facing policy. Only the backend service role can access them.
- Expiring offline access and refresh tokens are encrypted with AES-256-GCM and rotated before Shopify API calls.

Apply these migrations in order:

1. `supabase/migrations/0021_add_shopify_connections.sql`
2. `supabase/migrations/0022_add_shopify_oauth_state_brand_index.sql`
3. `supabase/migrations/0023_add_shopify_webhook_cache.sql`

## Operational webhooks

After OAuth, Teviq idempotently registers shop-scoped HTTPS subscriptions at:

`https://teviq-support-ai-backend.onrender.com/api/integrations/shopify/webhooks`

Registered topics:

- `products/create`, `products/update`, `products/delete`
- `orders/create`, `orders/updated`, `orders/cancelled`
- `fulfillments/create`, `fulfillments/update`
- `app/uninstalled`

The endpoint validates Shopify's raw-body HMAC before parsing JSON. It resolves the Teviq brand from the stored Shopify connection, never from webhook payload data, and uses `X-Shopify-Webhook-Id` to prevent duplicate processing. Failed or stale events can be safely retried.

When Shopify sends `app/uninstalled`, Teviq first clears the brand's Shopify cache and then deletes the connection row, including encrypted access and refresh tokens. The webhook event ledger remains available without retaining the token or raw payload.

`Sync now` remains the reconciliation fallback. It paginates through products and recent orders, refreshes the same cache, and removes records no longer returned by Shopify only after a complete traversal. If a configured page cap is reached, fetched records are updated but unmatched cache rows are preserved. The default limits cover 5,000 products and 2,000 recent orders.

If an existing store was authorized before `read_fulfillments` was added, activate the updated app version and reconnect that store once. Teviq registers all subscriptions allowed by current scopes and reports a partial internal status until the missing scope is granted.

## Client flow

1. The brand owner opens **Shopify** in Teviq.
2. They enter the permanent `.myshopify.com` store address.
3. Teviq opens Shopify's authorization screen.
4. Shopify returns to the backend callback.
5. Teviq validates HMAC, one-time state, store domain, brand ownership and token response.
6. Teviq registers operational webhooks without making OAuth success depend on a single subscription call.
7. The dashboard returns in the connected state and can reconcile store summary, products and recent orders.

The existing demo provider remains available for `vastra-demo`, `urban-demo` and `beauty-demo`. Live customer order lookups in `/api/chat` should be enabled only with a customer-verification contract; this connector does not weaken the existing public chat endpoint to expose Shopify order data by a guessed order number.

Mandatory compliance webhooks (`customers/data_request`, `customers/redact`, `shop/redact`) are a separate Public Distribution review requirement. They are not represented as complete by this operational sync layer and must be implemented before an App Store submission.
