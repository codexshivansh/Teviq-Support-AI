# Changelog Summary

This summary is inferred from the current codebase, existing docs, and available Git history. The local Git history is fragmented across root/backend/widget/website, so treat this as a product milestone summary rather than an authoritative release log.

## Completed Milestones

### Initial MVP Foundation

- Created Express backend.
- Added `POST /api/chat`.
- Added Gemini primary and Groq fallback.
- Added local JSON brand, FAQ, and order data.
- Added embeddable `widget.js`.
- Added demo HTML page.

### Client Demo Readiness

- Improved intent detection.
- Added order ID extraction.
- Added order tracking, returns, refunds, cancellation, COD, shipping, size help, and product recommendation intents.
- Added in-memory conversation memory.
- Added lead capture.
- Added local analytics logs.
- Improved widget UI and quick replies.

### Deployment Readiness

- Added `process.env.PORT`.
- Added production CORS config.
- Added env validation warnings.
- Added rate limiting.
- Added Helmet.
- Added `/api/brand-config/:brandId`.
- Added smoke test script.

### Multi-Brand Onboarding

- Refactored brand data into `backend/data/brands/{brandId}.json`.
- Added demo brands:
  - `vastra-demo`
  - `urban-demo`
  - `beauty-demo`
- Added brand validation script.
- Added demo storefront pages per brand.

### Polished Demo Package

- Added widget demo hub.
- Improved demo storefronts.
- Added brand-specific order mapping.
- Prevented cross-brand order leakage.
- Added demo script and README updates.

### AI Support Brain

- Added modular brain:
  - conversation analyzer.
  - intent engine.
  - entity extractor.
  - context builder.
  - tool router.
  - response validator.
  - support brain orchestrator.
- Added policy service.
- Made chat controller thin.
- Added brain test script.

### Architecture and Production Docs

- Added deployment checklist.
- Added production tests.
- Added architecture v2 document.

### Widget Premium UX

- Upgraded widget into a premium support panel.
- Added support result card rendering.
- Added persistent/context-aware suggested actions.
- Added mobile fullscreen keyboard-safe behavior.
- Added `Powered by teviq.in` branding.

### Knowledge Brain v1

- Added document upload for PDF/DOCX/TXT.
- Added extraction, chunking, embedding, retrieval, vector storage.
- Added brand-isolated retrieval.
- Added citations for debugging.
- Integrated retrieval before AI generation.

### Shopify Demo Connector

- Added Shopify-style demo provider.
- Added product/order demo data.
- Updated order service to check Shopify demo first.
- Added product recommendations from Shopify demo products.
- Added protected Shopify demo API endpoints.
- Added test script.

### Dashboard v1 and SaaS Admin Experience

- Added React/Vite/Tailwind dashboard.
- Added Overview, Knowledge, Playground, Shopify, Analytics, Settings.
- Added workspace selector.
- Added Widget Install page.
- Added Conversations page.
- Added setup progress command center.

### Clerk Authentication

- Added Clerk React SDK.
- Added premium login page.
- Added protected dashboard routes.
- Added backend Clerk JWT verification middleware.
- Added demo login for non-production/demo mode.
- Fixed Authorization header attachment.
- Fixed stale demo session cleanup.

### CORS/Auth Production Fixes

- Updated backend CORS to support dashboard and Vercel preview deployments.
- Allowed Authorization and Content-Type headers.
- Added production website origins.

### Marketing Website Improvements

- Built Teviq website V1.
- Added SEO/favicons.
- Improved hero layout.
- Wired Live Demo navigation.
- Preloaded widget script and preconnected backend/widget domains.
- Removed missing hero video request.

## Recent Git Hints

Backend recent commits include:

- Production CORS configuration.
- Authenticated dashboard CORS fixes.
- Clerk auth middleware.
- Shopify demo connector.

Widget recent commits include:

- Mobile layout and keyboard handling.
- Industry-oriented suggested actions.
- Quick suggestions UX.
- Layout hierarchy and spacing.

Website recent commits include:

- Missing hero video request removal.
- Live demo widget loading speed.
- Hero layout and live demo navigation.
- Landing page conversion work.

