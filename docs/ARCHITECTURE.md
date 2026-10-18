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
  - Live Shopify connector + demo fixtures
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
  - Groq generation
  - System fallback
          |
          v
Storage
  - Supabase brands and runtime records
  - Supabase knowledge text and metadata (local lexical retrieval)
  - Private Supabase Storage documents
  - Supabase analytics and workflow state
  - Local JSON demo fixtures only
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
- Shopify: OAuth connection, sync, products, and order counts.
- Conversations and Analytics: protected brand-scoped runtime data.
- Settings: workspace configuration with defined local-only presentation state where persistence is not yet required.

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

Current order of execution:

1. Build prompt with brand tone, policies, FAQs, memory, intent, and retrieved knowledge.
2. Call Groq using `GROQ_API_KEY`.
3. If Groq fails and a strong knowledge match exists, return an extractive system fallback.
4. Otherwise return a safe system fallback or escalation.

The deprecated Gemini caller fails closed before network access. Knowledge search and indexing use local lexical processing.

Current model default:

- Groq: `openai/gpt-oss-20b`

See `docs/GROQ_ONLY_MODE.md` for operational status, ZDR scope, tests, and lexical-search limitations.

## Database and Storage

Production runtime data is persistent:

- Supabase `brands` for brand and public widget settings.
- Supabase `knowledge_documents`, `knowledge_chunks`, and `structured_knowledge`.
- Private Supabase Storage for original PDF/DOCX/TXT uploads.
- Supabase `chat_logs` and `conversation_states`.
- Supabase Shopify OAuth, connection, cache, and webhook tables.

Local JSON under `data/` is retained only for demo fixtures and legacy fallback tests. General last-10-message prompt memory hydrates from brand/customer-scoped `chat_logs` after a cold start and uses an in-process fast path. Workflow state is persistent in `conversation_states`.

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

Shopify supports both a live OAuth connector and demo fixtures:

- The integration service chooses a live connection or the demo provider.
- Offline credentials are encrypted before Supabase persistence.
- Product/order reconciliation and operational webhooks update a support-safe cache.
- HMAC validation, deduplication, uninstall cleanup, and identity-verified order access are enforced.
- Mandatory compliance handlers exist; Shopify registration/review remains an external launch step.

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
5. Original bytes are stored in a private, brand-scoped Supabase Storage object.
6. Local lexical indexing creates compatibility features without an embedding API request.
7. Supabase persists metadata, knowledge text, and compatibility vectors.
8. Retrieval reads only the requested brand's text and ranks it with local lexical matching.
9. Support Brain uses grounded context before Groq when AI is allowed.

## Analytics

Analytics persist in Supabase `chat_logs`. Each chat stores timestamp, brand, customer, message, intent, escalation, source, reply, knowledge confidence/citations, fallback flag, and response time.

The dashboard analytics and conversations pages query protected brand-scoped APIs backed by this table. A true resolution/CSAT event is still future work.
