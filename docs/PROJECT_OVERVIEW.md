# Project Overview

## What Teviq Support AI Is

Teviq Support AI is an AI customer support platform for e-commerce and D2C brands. It is not built to support `teviq.in` directly. `teviq.in` is the marketing website. The product itself is a multi-brand support system that client brands can embed on their own storefronts through one JavaScript snippet.

The system currently includes:

- A public embeddable website widget.
- A Node.js/Express backend.
- A modular AI Support Brain.
- A local Knowledge Brain for uploaded PDF, DOCX, and TXT documents.
- Brand-isolated JSON onboarding.
- A Shopify-style demo connector.
- A React/Vite brand dashboard with Clerk authentication.
- A Vite/React marketing website for Teviq.

## Business Goal

The business goal is to help D2C brands reduce repetitive support workload while keeping answers brand-aware, policy-aware, order-aware, and escalation-aware.

The core customer value is:

- Instant answers for order tracking, shipping, returns, exchange, refund guidance, COD, FAQs, and product questions.
- Safer support because the system does not invent order status or promise refunds outside policy.
- Fast deployment through one script tag.
- Future path toward Shopify, WhatsApp, analytics, and full support operations.

## Repository Responsibilities

The ecosystem is split across two local project locations:

```text
/Users/shivanshgupta/Documents/AI Support bot/teviq-support-ai/
  backend/      Express API, AI Support Brain, Knowledge Brain, Shopify demo connector
  dashboard/    React/Vite SaaS admin dashboard
  widget/       Plain JavaScript embeddable widget and demo storefronts
  docs/         Developer handover documentation

/Users/shivanshgupta/Documents/teviq site/
  src/          Marketing website for teviq.in
  public/       Favicons, logo assets, manifest, sitemap, robots
```

### Backend

The backend owns customer support behavior. It exposes public widget APIs, protected dashboard APIs, brand config, AI generation, policy checks, retrieval, local logs, and demo integrations.

### Dashboard

The dashboard is the brand owner/admin experience. It lets a D2C operator view setup progress, manage knowledge documents, test AI responses, inspect demo Shopify status, copy the widget embed script, and preview analytics/settings.

### Widget

The widget is a frameworkless embed. Client brands load it with:

```html
<script
  src="https://teviq-support-ai-widget.vercel.app/widget.js"
  data-brand-id="CLIENT_BRAND_ID"
  data-api-url="https://teviq-support-ai-backend.onrender.com">
</script>
```

It fetches public brand config, renders the chat UI, sends messages to `/api/chat`, and shows premium support cards where possible.

### Website

The marketing website explains Teviq Support AI and includes a live widget embed for demos. It preconnects/preloads the widget and backend domains to improve perceived speed.

## High-Level Architecture

```text
Customer on brand storefront
  -> Widget script
  -> Backend /api/chat
  -> AI Support Brain
  -> Tools: orders, policy, lead, escalation, product, knowledge
  -> Gemini primary / Groq fallback when AI is allowed
  -> Response validator
  -> Widget response cards or text fallback

Brand owner
  -> Dashboard
  -> Clerk auth
  -> Protected backend APIs
  -> Knowledge upload/list/delete and Shopify demo status
```

## Deployment Architecture

Current intended production deployment:

| Surface | Platform | Current role |
| --- | --- | --- |
| Backend | Render | Express API, AI Support Brain, protected APIs |
| Widget | Vercel/static hosting | `widget.js` and demo storefront pages |
| Dashboard | Vercel | Clerk-protected SaaS admin portal |
| Website | Vercel/static hosting | `teviq.in` marketing website |
| Auth | Clerk | Dashboard sessions and JWTs |
| AI | Gemini + Groq | Customer-facing support generation |

Production URLs currently referenced in code/docs:

- Backend: `https://teviq-support-ai-backend.onrender.com`
- Widget: `https://teviq-support-ai-widget.vercel.app/widget.js`
- Dashboard: `https://teviq-support-ai-dashboard-ph9p.vercel.app`
- Website: `https://teviq.in`

## Current Product Boundary

The project is demo/client-ready but not yet a fully production SaaS platform. It intentionally does not yet include:

- Persistent database for brands, users, conversations, orders, or analytics.
- Real Shopify OAuth.
- Real WhatsApp integration.
- Billing/payments.
- Role-based team permissions.
- Automated tenant provisioning.

