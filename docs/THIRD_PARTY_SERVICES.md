# Third-Party Services

## Clerk

Purpose:
Dashboard authentication.

Used by:

- Dashboard frontend: `@clerk/clerk-react`
- Backend middleware: `@clerk/backend`

Required values:

- Dashboard: `VITE_CLERK_PUBLISHABLE_KEY`
- Backend: `CLERK_SECRET_KEY`

Important:
Frontend publishable key and backend secret key must belong to the same Clerk instance/environment.

## Render

Purpose:
Backend hosting.

Current backend URL:

```text
https://teviq-support-ai-backend.onrender.com
```

Render runs:

```bash
npm start
```

## Supabase

Purpose:

- Production brand system of record.
- Knowledge document metadata and pgvector retrieval.
- Private original-document storage.
- Shopify connections and support-safe cache.
- Conversation workflow state and analytics.

Required values:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- optional `SUPABASE_KNOWLEDGE_BUCKET` (defaults to `knowledge-documents`)

Important:
The service-role key is backend-only. The Knowledge service creates a private bucket through the Storage API when needed and stores files under `{brandId}/{storedFileName}`.

## Vercel

Purpose:

- Dashboard hosting.
- Widget static hosting.
- Marketing website hosting.

Current URLs referenced:

```text
https://teviq-support-ai-dashboard-ph9p.vercel.app
https://teviq-support-ai-widget.vercel.app
https://teviq.in
```

## Web3Forms

Purpose:
Marketing-site demo/contact form delivery.

Required website value:

- `VITE_WEB3FORMS_KEY`

Important:
Keep form validation and spam controls enabled, and verify the recipient inbox before launch.

## Gemini

Purpose:
Primary AI generation provider.

Used by:

```text
backend/services/ai.service.js
```

Env:

```text
GEMINI_API_KEY=<GEMINI_API_KEY>
GEMINI_MODEL=gemini-3.5-flash
```

Behavior:

- Called first.
- Timeout: 15 seconds.
- Temperature: 0.3.
- Max output tokens: 350.

## Groq

Purpose:
Fallback AI generation provider.

Env:

```text
GROQ_API_KEY=<GROQ_API_KEY>
GROQ_MODEL=openai/gpt-oss-20b
```

Behavior:

- Called if Gemini fails.
- Timeout: 15 seconds.
- Temperature: 0.3.
- Max tokens: 350.

## Shopify

Current status:
Live OAuth/Admin API connector with demo fixtures for the three internal demo workspaces.

Used by:

- OAuth installation and encrypted offline access.
- Product and order reconciliation.
- Product recommendation and identity-verified order lookup.
- Operational and compliance webhooks.
- Dashboard Shopify page.

Files:

```text
backend/integrations/shopify/shopifyAdmin.provider.js
backend/integrations/shopify/shopifyIntegration.service.js
backend/integrations/shopify/shopifyWebhook*.js
backend/integrations/shopify/shopifyDemo.provider.js
backend/data/shopify-demo/*
```

Important:
Production launch still depends on the app's Shopify distribution/review status and granted protected-customer-data access. Demo fixtures must never be used as fallback for a live customer brand.

## GitHub

Purpose:
Source control and deployment trigger.

Current note:
Backend, dashboard, widget, and website are separate repositories. Preserve explicit release coordination until a canonical monorepo decision is made.

## External Browser/CDN Runtime

The widget is loaded directly by client websites. Production embeds use immutable versioned files so an unreviewed stable-alias change does not silently affect installed clients.

Current production release:

```text
https://teviq-support-ai-widget.vercel.app/v1.1.0/widget.js
```

Short-cache stable alias for development and staged rollout:

```text
https://teviq-support-ai-widget.vercel.app/widget.js
```
