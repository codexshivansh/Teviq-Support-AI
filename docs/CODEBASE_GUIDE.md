# Codebase Guide

## Main Ecosystem Paths

```text
/Users/shivanshgupta/Documents/AI Support bot/teviq-support-ai
/Users/shivanshgupta/Documents/teviq site
```

## `teviq-support-ai/backend`

Purpose:
Runs the Express API, Support Brain, Knowledge Brain, local brand data, demo Shopify connector, and protected dashboard endpoints.

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
- `shopify.routes.js`: protected Shopify demo endpoints.

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

- `ai.service.js`: Gemini/Groq calls, prompt generation, fallback.
- `brand.service.js`: loads/validates brand JSON and public widget config.
- `order.service.js`: Shopify demo first, local orders fallback.
- `policy.service.js`: return/exchange/cancellation/refund logic.
- `escalation.service.js`: hard escalation detection and manager reply.
- `lead.service.js`: contact extraction and lead capture reply.
- `memory.service.js`: in-memory last 10 messages per brand/customer.
- `analytics.service.js`: local chat log append.
- `product.service.js`: demo product recommendation.
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
- `embedding.service.js`: local hash embedding and cosine similarity.
- `vectorStore.service.js`: local JSON vector store.
- `retrieval.service.js`: query retrieval, citations, confidence checks.
- `knowledge.service.js`: ingestion orchestration.

Safe to modify:
Yes, but retrieval changes affect AI grounding.

Risk:
Changing embedding algorithm invalidates existing local vector store embeddings.

## `backend/integrations/shopify`

Purpose:
Demo connector architecture for Shopify-style data.

Files:

- `shopifyDemo.provider.js`: reads local demo products/orders.
- `shopifySync.service.js`: status/sync/list facade.

Safe to modify:
Yes, especially when replacing demo provider with a real Shopify provider later.

## `backend/data`

Purpose:
Local demo data.

Important folders:

- `brands/`: brand onboarding JSON files.
- `shopify-demo/`: demo Shopify product/order files.
- `orders.json`: fallback order data.
- `knowledge/`: local vector store generated at runtime.

Safe to modify:
Brand/demo files are safe if schema is preserved and `npm run validate:brands` passes.

Risk:
Never put real customer data or secrets in committed JSON.

## `backend/logs`

Purpose:
Local chat analytics logs.

Risk:
Logs can contain customer messages. Do not commit real production logs.

## `backend/uploads`

Purpose:
Uploaded knowledge files by brand.

Risk:
Uploaded documents may contain client data. Do not commit production uploads.

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

## Generated or Duplicate Files to Watch

The current tree includes some files that should be reviewed before a clean handoff:

- `backend/package-lock 2.json`
- `backend/logs/chat-logs 2.json`
- `backend/logs/chat-logs 3.json`
- `widget/widget 2.js`
- `widget/demo-* 2.html`
- `.DS_Store` files

Do not delete without checking Git status and confirming they are accidental duplicates.

