# Architecture

## Architecture Diagram

```text
Website / Dashboard / Client Storefront
          |
          v
Frontend Layer
  - Marketing website
  - React dashboard
  - Embeddable widget
          |
          v
Authentication Layer
  - Clerk for dashboard
  - Public widget chat endpoints
          |
          v
Express Backend
  - Routes/controllers
  - AI Support Brain
  - Knowledge Brain
  - Shopify demo connector
          |
          v
Business Tools
  - Brand service
  - Order service
  - Policy service
  - Lead service
  - Escalation service
  - Product service
          |
          v
AI Provider Layer
  - Gemini primary
  - Groq fallback
  - System fallback
          |
          v
Storage
  - Local JSON brand/order/product data
  - Local vector store JSON
  - Uploaded knowledge files
  - Local chat logs
```

## Frontend

### Dashboard

Location:

```text
teviq-support-ai/dashboard
```

Tech:

- React 19
- Vite
- TailwindCSS
- Framer Motion
- Recharts
- Clerk React SDK
- Lucide icons

The dashboard is a single-page admin portal with custom path-to-page routing in `src/App.jsx`. It is protected by the `AuthProvider` in `src/auth/AuthContext.jsx`.

Live API-backed pages:

- Home setup metrics: Knowledge + Shopify status.
- Knowledge Base: document list, upload, delete.
- AI Playground: chat test.
- Shopify Status: demo connector status, sync, products.

Demo/static pages:

- Conversations.
- Analytics Preview.
- Settings.

### Widget

Location:

```text
teviq-support-ai/widget/widget.js
```

The widget is plain JavaScript and injects its own CSS into the host page. It reads:

- `data-brand-id`
- `data-api-url`

It then calls:

- `GET /api/brand-config/:brandId`
- `POST /api/chat`

It renders:

- Premium welcome surface.
- Quick replies.
- Persistent suggested action chips.
- Support result cards for order, return, refund, human support, lead capture, product recommendation, and errors.
- Mobile fullscreen mode for screens `<= 640px`.

### Marketing Website

Location:

```text
/Users/shivanshgupta/Documents/teviq site
```

Tech:

- React 18
- Vite
- TailwindCSS
- Framer Motion
- React Router
- React Icons

The site includes SEO metadata, marketing sections, pricing, live demo links, and an embedded widget script in `index.html`.

## Authentication

Dashboard auth uses Clerk:

- Frontend SDK: `@clerk/clerk-react`
- Backend verification: `@clerk/backend`
- Token source: `useAuth().getToken()`
- Header: `Authorization: Bearer <jwt>`

Protected backend route groups:

- `/api/knowledge/*`
- `/api/integrations/shopify/*`

Public backend routes:

- `/health`
- `/api/brand-config/:brandId`
- `/api/chat`

Demo login exists only when the dashboard is not a production build:

```js
!import.meta.env.PROD &&
(import.meta.env.DEV || import.meta.env.VITE_ENABLE_DEMO_LOGIN === "true")
```

Backend demo auth bypass is also non-production only:

```js
NODE_ENV !== "production" && ENABLE_DEMO_LOGIN !== "false"
```

## Backend

Location:

```text
teviq-support-ai/backend
```

Tech:

- Node.js
- Express
- CommonJS
- Helmet
- CORS
- express-rate-limit
- Multer
- pdf-parse
- mammoth

`server.js` wires middleware, CORS, rate limiting, routes, 404s, and error handling.

Route groups:

- `routes/chat.routes.js`
- `routes/brand-config.routes.js`
- `routes/knowledge.routes.js`
- `routes/shopify.routes.js`

Controllers are intentionally thin and delegate to services/brain modules.

## AI Models

The AI provider logic lives in:

```text
backend/services/ai.service.js
```

Order of execution:

1. Build prompt with brand tone, policies, FAQs, memory, intent, and retrieved knowledge.
2. Call Gemini using `GEMINI_API_KEY`.
3. If Gemini fails, call Groq using `GROQ_API_KEY`.
4. If both fail and a strong knowledge match exists, return an extractive system fallback.
5. Otherwise return a safe system fallback.

Current models default to:

- Gemini: `gemini-1.5-flash`
- Groq: `llama-3.1-8b-instant`

## Database and Storage

There is no production database yet.

Current storage is local filesystem JSON:

- Brand files: `backend/data/brands/{brandId}.json`
- Legacy/fallback orders: `backend/data/orders.json`
- Shopify demo products/orders: `backend/data/shopify-demo/*`
- Knowledge vector store: `backend/data/knowledge/vector-store.json`
- Uploaded knowledge files: `backend/uploads/knowledge/{brandId}/`
- Analytics logs: `backend/logs/chat-logs.json`

Future intended database:

- Supabase/PostgreSQL for brands, users, settings, documents, conversations, orders, analytics, and tenant permissions.
- Qdrant or another vector database for production retrieval.

## Widget

The widget is the customer-facing support channel. It is designed to be hosted on static/CDN infrastructure and embedded into client storefronts.

Important constraints:

- No React or framework runtime.
- Prefix CSS with `teviq-` to avoid host page pollution.
- Use only public backend endpoints.
- Never expose private brand config.
- Use `brandId` for brand isolation.

## Client Website

A client brand installs the widget script on their storefront. Teviq does not currently verify installation automatically. The dashboard Widget Install page provides the snippet and instructions.

## Shopify

Shopify integration is currently demo-only:

- Provider: `backend/integrations/shopify/shopifyDemo.provider.js`
- Sync facade: `backend/integrations/shopify/shopifySync.service.js`
- Data: `backend/data/shopify-demo/*`

The order service checks the Shopify demo provider first, then falls back to `orders.json`.

Future real Shopify plan:

- OAuth app install.
- Store access tokens securely.
- Sync products/orders/customers.
- Webhooks for order updates.
- Replace demo provider behind the same provider interface.

## Knowledge Base

Knowledge Brain modules live in:

```text
backend/knowledge
```

Flow:

1. Dashboard uploads PDF/DOCX/TXT.
2. Multer validates file type and size.
3. Extractor reads text.
4. Chunker splits into semantic-ish sections.
5. Embedding service creates local hash embeddings.
6. Vector store persists chunks and metadata.
7. Retrieval filters chunks by `brandId`.
8. Support Brain uses retrieval before Gemini/Groq when AI is allowed.

## Analytics

Current analytics are local logs:

```text
backend/logs/chat-logs.json
```

Each chat stores timestamp, brand, customer, message, detected intent, escalation flag, source, reply, knowledge confidence, and citations.

Dashboard analytics are static demo data in:

```text
dashboard/src/data/analytics.js
```

