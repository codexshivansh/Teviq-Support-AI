# Environment Variables

Never commit real values. Backend secrets belong only in Render/local `.env`; dashboard `VITE_*` values are browser-visible.

## Backend

| Variable | Required in production | Secret | Purpose |
| --- | --- | --- | --- |
| `NODE_ENV` | Yes | No | Use `production` on Render. |
| `PORT` | Platform-provided | No | Express port; local default is `5000`. |
| `ALLOWED_ORIGINS` | Yes | No | Comma-separated browser origins. Values are trimmed and deduplicated. |
| `GEMINI_API_KEY` | No (legacy only) | Yes | Ignored by the current backend; Gemini calls fail closed before network access. Remove from Render when convenient. |
| `GEMINI_MODEL` | No (legacy only) | No | Ignored by the current backend. |
| `GEMINI_EMBEDDING_MODEL` | No (legacy only) | No | Ignored; knowledge indexing and retrieval are local. |
| `GROQ_API_KEY` | Yes for generated AI replies | Yes | Current AI generation provider. |
| `GROQ_MODEL` | No | No | Default `openai/gpt-oss-20b`. |
| `CLERK_SECRET_KEY` | Yes | Yes | Verifies dashboard JWTs and manages approved metadata updates. |
| `ENABLE_DEMO_LOGIN` | No | No | Must be `false`/omitted in production. |
| `SUPABASE_URL` | Yes | No | Supabase project URL. |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Yes | Server-only database and Storage access. |
| `SUPABASE_KNOWLEDGE_BUCKET` | No | No | Private source-document bucket; default `knowledge-documents`. |
| `INTERNAL_CRON_SECRET` | Yes for scheduled jobs | Yes | Protects internal recovery and token-refresh endpoints. |
| `SHOPIFY_CLIENT_ID` | Yes for live Shopify | No | Shopify app client ID. |
| `SHOPIFY_CLIENT_SECRET` | Yes for live Shopify | Yes | Shopify app secret and webhook HMAC key. |
| `SHOPIFY_CREDENTIALS_SECRET` | Yes for live Shopify | Yes | Independent AES-256-GCM token-encryption secret. |
| `SHOPIFY_SCOPES` | No | No | `read_products,read_orders,read_fulfillments`. |
| `SHOPIFY_ADMIN_API_VERSION` | No | No | Current configured version `2026-07`. |
| `SHOPIFY_REDIRECT_URI` | Yes for OAuth | No | Exact production OAuth callback URL. |
| `PUBLIC_API_URL` | Yes for Shopify webhooks | No | Public backend base URL. |
| `DASHBOARD_URL` | Yes for OAuth return | No | `https://dashboard.teviq.in`. |
| `INSTAGRAM_APP_SECRET` | Yes for Instagram Login/webhooks | Yes | Meta app secret used to verify webhook signatures and exchange OAuth tokens. |
| `INSTAGRAM_APP_ID` | Yes for Instagram Login | No | Meta app ID used to start Instagram OAuth. |
| `INSTAGRAM_REDIRECT_URI` | Recommended for Instagram Login | No | Exact registered HTTPS callback; defaults to `PUBLIC_API_URL/api/instagram/oauth/callback`. |
| `INSTAGRAM_WEBHOOK_VERIFY_TOKEN` | Yes for Instagram webhooks | Yes | Random string you choose and enter in Meta's webhook configuration. |
| `INSTAGRAM_GRAPH_API_VERSION` | No | No | Graph API version for Instagram messaging; defaults to `v26.0`. |
| `SHOPIFY_PRODUCT_SYNC_MAX_PAGES` | No | No | Product sync safety cap; default `50`. |
| `SHOPIFY_ORDER_SYNC_MAX_PAGES` | No | No | Order sync safety cap; default `20`. |
| `TWILIO_ACCOUNT_SID` | Only if SMS is enabled | Yes | Twilio account identifier. |
| `TWILIO_AUTH_TOKEN` | Only if SMS is enabled | Yes | Twilio secret. |
| `TWILIO_PHONE_NUMBER` | Only if SMS is enabled | No | Twilio sender number. |

Minimum production example:

```env
NODE_ENV=production
ALLOWED_ORIGINS=https://dashboard.teviq.in,https://teviq.in,https://www.teviq.in
CLERK_SECRET_KEY=<secret>
GROQ_API_KEY=<secret>
SUPABASE_URL=https://<project>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<secret>
SUPABASE_KNOWLEDGE_BUCKET=knowledge-documents
INTERNAL_CRON_SECRET=<long-random-secret>
SHOPIFY_CLIENT_ID=<client-id>
SHOPIFY_CLIENT_SECRET=<secret>
SHOPIFY_CREDENTIALS_SECRET=<independent-long-random-secret>
SHOPIFY_SCOPES=read_products,read_orders,read_fulfillments
SHOPIFY_ADMIN_API_VERSION=2026-07
SHOPIFY_REDIRECT_URI=https://teviq-support-ai-backend.onrender.com/api/integrations/shopify/oauth/callback
PUBLIC_API_URL=https://teviq-support-ai-backend.onrender.com
DASHBOARD_URL=https://dashboard.teviq.in
INSTAGRAM_APP_SECRET=<secret>
INSTAGRAM_APP_ID=<app-id>
INSTAGRAM_REDIRECT_URI=https://teviq-support-ai-backend.onrender.com/api/instagram/oauth/callback
INSTAGRAM_WEBHOOK_VERIFY_TOKEN=<long-random-secret>
INSTAGRAM_GRAPH_API_VERSION=v26.0
```

Missing `GROQ_API_KEY` does not crash startup; AI replies use grounded local/system fallbacks. Knowledge indexing and retrieval run locally over Supabase text and do not require a Gemini key. Missing Supabase or Clerk secrets makes the related operations fail closed.

## Dashboard

| Variable | Required | Secret | Purpose |
| --- | --- | --- | --- |
| `VITE_CLERK_PUBLISHABLE_KEY` | Yes | No | Clerk browser key for the same instance as backend `CLERK_SECRET_KEY`. |
| `VITE_ENABLE_DEMO_LOGIN` | No | No | Development/demo only; set `false` in production. |
| `VITE_API_BASE_URL` | No | No | Backend override; production fallback is the Render API. |

Never put a Clerk secret, Supabase service role, Shopify secret, or AI key in any `VITE_*` variable.

## Widget

The widget uses script attributes:

```html
<script
  src="https://teviq-support-ai-widget.vercel.app/v1.1.0/widget.js"
  data-brand-id="CLIENT_BRAND_ID"
  data-api-url="https://teviq-support-ai-backend.onrender.com">
</script>
```

`data-brand-id` is public, not authorization. The backend validates that the brand exists and is active, and all retrieval/order operations remain server-scoped.

## Website

The website embeds the pinned widget release in `index.html`. Keep its valid `VITE_WEB3FORMS_KEY` configured in Vercel for the demo/contact form.

## Rotation Rules

- Rotate any secret that appears in a screenshot, log, commit, browser bundle, or support message.
- Rotate `SHOPIFY_CREDENTIALS_SECRET` only with a token re-encryption plan.
- Frontend and backend Clerk keys must belong to the same Clerk environment.
- Keep `SUPABASE_SERVICE_ROLE_KEY` server-only.
