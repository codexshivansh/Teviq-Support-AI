# Codebase Guide

## Main Ecosystem Paths

```text
/Users/shivanshgupta/Documents/AI Support bot/teviq-support-ai
/Users/shivanshgupta/Documents/AI Support bot/teviq.in
```

## `teviq-support-ai/backend`

Purpose:
Runs the Express API, Support Brain, Knowledge Brain, Supabase persistence, live Shopify connector, demo fixtures, and protected dashboard endpoints.

Important files:

- `server.js`: Express app, middleware, route registration, error handling.
- `package.json`: backend scripts and dependencies.
- `.env.example`: backend environment variable template.

Safe to modify:
Yes, with tests. Avoid changing response shape for `/api/chat` because the widget and dashboard playground depend on it.

Risk:
Changing auth/CORS can break deployed dashboard. Changing support rules can break demo flows.

## `backend/routes`

Purpose:
Maps route paths to controllers.

Files:

- `chat.routes.js`: `POST /api/chat`
- `brand-config.routes.js`: `GET /api/brand-config/:brandId`
- `knowledge.routes.js`: protected knowledge endpoints.
- `shopify.routes.js`: protected Shopify OAuth, status, sync, product, and disconnect endpoints.

Safe to modify:
Additive routes are safe. Renaming/removing routes is risky.

## `backend/controllers`

Purpose:
HTTP validation and response shaping.

Files:

- `chat.controller.js`: validates body and delegates to Support Brain.
- `knowledge.controller.js`: upload/list/delete/retrieve documents.
- `shopify.controller.js`: status/sync/products.

Safe to modify:
Yes, if response formats remain stable.

## `backend/brain`

Purpose:
Modular AI Support Brain.

Files:

- `conversationAnalyzer.js`: language, sentiment, message type.
- `intentEngine.js`: rule-based intent detection.
- `entityExtractor.js`: order ID, phone, email, size, color, etc.
- `toolRouter.js`: decides whether tools/system replies or AI should handle a message.
- `contextBuilder.js`: creates context object for AI and validation.
- `responseValidator.js`: removes unsafe output, enforces order/policy constraints.
- `supportBrain.js`: main orchestrator.

Safe to modify:
Yes, but changes here directly affect customer replies.

Potential risks:

- Intent priority can cause wrong routing.
- Response validation must not remove required information.
- Brand isolation must remain intact.

## `backend/services`

Purpose:
Business services used by the Support Brain.

Files:

- `ai.service.js`: Groq calls, prompt generation, grounded local/system fallback. Gemini is disabled for customer-data processing.
- `brand.service.js`: loads/validates Supabase brands and returns public widget config.
- `order.service.js`: live Shopify cache/provider with demo/local fallback restricted to explicit demo brands.
- `policy.service.js`: return/exchange/cancellation/refund logic.
- `escalation.service.js`: hard escalation detection and manager reply.
- `lead.service.js`: contact extraction and lead capture reply.
- `memory.service.js`: last 10 prompt messages per brand/customer, hydrated from Supabase `chat_logs` after a cold start with an in-process fast path.
- `analytics.service.js`: brand-scoped Supabase chat analytics.
- `product.service.js`: live Shopify catalog recommendation with explicit demo fallback.
- `intent.service.js`: older intent utility; Support Brain now uses `brain/intentEngine.js`.

Safe to modify:
Business rules should be modified carefully and tested with `npm run test:brain`.

## `backend/knowledge`

Purpose:
Knowledge Brain v1.

Files:

- `upload.service.js`: Multer file upload, type/size validation.
- `extraction.service.js`: PDF/DOCX/TXT text extraction.
- `chunking.service.js`: semantic-ish section chunking.
- `embedding.service.js`: offline compatibility features for knowledge writes.
- `vectorStore.service.js`: Supabase knowledge text persistence and brand-scoped lexical queries; legacy vector rows are retained but not searched.
- `retrieval.service.js`: query retrieval, citations, confidence checks.
- `knowledge.service.js`: ingestion orchestration.

Safe to modify:
Yes, but retrieval changes affect AI grounding.

Risk:
Changing the embedding model or dimensions requires a new column/RPC and a controlled backfill.

## `backend/integrations/shopify`

Purpose:
Live OAuth Shopify connector plus demo-provider fallback.

Files:

- `shopifyIntegration.service.js`: selects live or demo behavior.
- `shopifyAdmin.provider.js`: Shopify Admin API and reconciliation.
- `shopifyWebhook*.js`: operational webhook registration/processing.
- `shopifyDemo.provider.js`: local demo products/orders.

Safe to modify:
Yes, with OAuth, webhook HMAC, token encryption, uninstall cleanup, and identity-verification regression tests.

## `backend/data`

Purpose:
Local demo data.

Important folders:

- `brands/`: seed/reference JSON for demo brands, not the production system of record.
- `shopify-demo/`: demo Shopify product/order files.
- `orders.json`: legacy fallback order data.

Safe to modify:
Demo files are safe if schema is preserved and cross-brand tests continue to pass. Production brands are created in Supabase.

Risk:
Never put real customer data or secrets in committed JSON.

## Runtime records

Chat analytics, workflow state, knowledge metadata/vectors, and original uploaded documents are persistent in Supabase. Local `logs/` and `uploads/` paths are ignored legacy/development locations and must never contain committed customer data.

## `teviq-support-ai/dashboard`

Purpose:
SaaS admin experience for brand owners.

Important files:

- `src/App.jsx`: custom routing, auth wiring, selected brand state.
- `src/services/api.js`: backend client and Authorization header logic.
- `src/auth/AuthContext.jsx`: Clerk/demo auth state.
- `src/auth/authConfig.js`: publishable key and demo flag rules.
- `src/components/Layout.jsx`: sidebar, workspace selector, user profile.
- `src/pages/*`: dashboard pages.
- `src/data/*`: static demo data.

Safe to modify:
UI polish and page layout are safe. Auth and API client changes are high risk.

## `teviq-support-ai/widget`

Purpose:
Embeddable support widget and standalone demo storefronts.

Important files:

- `widget.js`: the actual embeddable script.
- `index.html`: demo hub.
- `demo-vastra.html`, `demo-urban.html`, `demo-beauty.html`: demo storefronts.
- `demo.html`: simple single-brand demo page.

Safe to modify:
Widget UI can be modified if public API contract remains unchanged.

Risk:
Because it runs on client websites, global CSS/JS pollution is dangerous. Keep classes prefixed with `teviq-`.

## Marketing Website: `/Users/shivanshgupta/Documents/teviq site`

Purpose:
Marketing website for `teviq.in`.

Important files:

- `src/App.jsx`: all routes and page sections.
- `src/index.css`: global Tailwind CSS and custom classes.
- `index.html`: SEO tags, favicon links, widget preload/embed.
- `public/`: logos, icons, manifest, robots, sitemap.

Safe to modify:
Marketing copy/layout can be modified carefully. Embedded widget script should continue using the production backend and brand ID.

## Generated Files

Generated logs, local backups, build output, environment files, and `.DS_Store` files are ignored. Keep canonical lockfiles and source files tracked; do not add timestamped backups or copied files with numeric suffixes.
