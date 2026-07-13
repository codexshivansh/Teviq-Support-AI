# Shopify Connector Setup

Teviq now supports a brand-scoped Shopify OAuth connection alongside the existing JSON demo connector. Client workspaces authorize the Teviq app in Shopify; they never paste Admin API access tokens into the dashboard.

## Shopify app configuration

1. Create the Teviq app in the Shopify Dev Dashboard.
2. Use public distribution when onboarding unrelated client stores.
3. Add this allowed redirection URL:

   `https://teviq-support-ai-backend.onrender.com/api/integrations/shopify/oauth/callback`

4. Request the minimum current scopes:

   `read_products,read_orders`

5. Configure protected customer data access in Shopify before using order data with production merchants.

Official references:

- [Shopify authorization code grant](https://shopify.dev/docs/apps/build/authentication-authorization/access-tokens/authorization-code-grant)
- [Shopify offline access tokens](https://shopify.dev/docs/apps/build/authentication-authorization/access-tokens/offline-access-tokens)
- [Shopify app distribution](https://shopify.dev/docs/apps/launch/distribution)

## Render environment variables

```env
SHOPIFY_CLIENT_ID=<Shopify app client ID>
SHOPIFY_CLIENT_SECRET=<Shopify app client secret>
SHOPIFY_CREDENTIALS_SECRET=<independent long random encryption secret>
SHOPIFY_SCOPES=read_products,read_orders
SHOPIFY_ADMIN_API_VERSION=2026-07
SHOPIFY_REDIRECT_URI=https://teviq-support-ai-backend.onrender.com/api/integrations/shopify/oauth/callback
PUBLIC_API_URL=https://teviq-support-ai-backend.onrender.com
DASHBOARD_URL=https://dashboard.teviq.in
```

Do not reuse or expose the Supabase service-role key, Shopify client secret, or credential-encryption secret in the dashboard.

## Data model

- `shopify_connections` stores one encrypted, brand-scoped offline connection per Shopify store.
- `shopify_oauth_states` stores hashed, one-time OAuth state for ten minutes.
- Both tables have RLS enabled and no browser-facing policy. Only the backend service role can access them.
- Expiring offline access and refresh tokens are encrypted with AES-256-GCM and rotated before Shopify API calls.

Apply these migrations in order:

1. `supabase/migrations/0021_add_shopify_connections.sql`
2. `supabase/migrations/0022_add_shopify_oauth_state_brand_index.sql`

## Client flow

1. The brand owner opens **Shopify** in Teviq.
2. They enter the permanent `.myshopify.com` store address.
3. Teviq opens Shopify's authorization screen.
4. Shopify returns to the backend callback.
5. Teviq validates HMAC, one-time state, store domain, brand ownership and token response.
6. The dashboard returns in the connected state and can sync store summary and products.

The existing demo provider remains available for `vastra-demo`, `urban-demo` and `beauty-demo`. Live customer order lookups in `/api/chat` should be enabled only with a customer-verification contract; this connector does not weaken the existing public chat endpoint to expose Shopify order data by a guessed order number.
