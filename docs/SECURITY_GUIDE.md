# Security Guide

## Security Model

Teviq currently has two classes of APIs:

Public widget APIs:

- `GET /health`
- `GET /api/brand-config/:brandId`
- `POST /api/chat`

Protected dashboard APIs:

- `/api/knowledge/*`
- `/api/integrations/shopify/*`

The widget must remain public because it runs on client storefronts. The dashboard APIs must remain protected because they expose brand documents, Shopify demo data, and operational controls.

## Clerk Authentication

Frontend:

- `dashboard/src/main.jsx` wraps the app with `ClerkProvider`.
- `dashboard/src/auth/AuthContext.jsx` obtains JWTs via `useAuth().getToken()`.
- `dashboard/src/services/api.js` attaches `Authorization: Bearer <jwt>` for protected requests.

Backend:

- `backend/middleware/clerkAuth.middleware.js` verifies JWTs with `@clerk/backend`.
- `CLERK_SECRET_KEY` must be configured in backend environment.

Protected request flow:

```text
Dashboard page loads
  -> Clerk session available
  -> getToken() returns JWT
  -> API client sends Authorization header
  -> Express middleware verifies token
  -> Controller executes
```

## Demo Login

Dashboard demo login is intentionally restricted:

```js
!import.meta.env.PROD &&
(import.meta.env.DEV || import.meta.env.VITE_ENABLE_DEMO_LOGIN === "true")
```

Backend demo auth is also restricted to non-production:

```js
NODE_ENV !== "production" && ENABLE_DEMO_LOGIN !== "false"
```

Production users must not be able to bypass Clerk with `x-teviq-demo-auth`.

## CORS

CORS is configured in:

```text
backend/config/cors.js
```

Current behavior:

- Whitelist-based origins.
- Credentials allowed.
- Authorization header allowed.
- Content-Type header allowed.
- `x-teviq-demo-auth` allowed for non-production demo flow.
- Vercel preview deployments are allowed by regex.

Do not use:

```js
origin: "*"
```

because credentials and Authorization headers require a specific allowed origin.

## Rate Limiting

`POST /api/chat` uses `express-rate-limit`:

- 60 requests per minute per IP.

This is basic abuse protection only. It is not billing-grade or tenant-aware.

## Helmet

The backend uses Helmet with cross-origin resource policy set to `cross-origin` so API/widget interactions do not break.

## Secrets

Secrets:

- `GEMINI_API_KEY`
- `GROQ_API_KEY`
- `CLERK_SECRET_KEY`

Non-secrets:

- Clerk publishable key.
- Public widget URL.
- Public backend URL.
- Brand IDs.

Rules:

- Never commit `.env`.
- Never put backend secrets in Vite frontend env variables.
- Rotate leaked keys immediately.
- Keep `.env.example` placeholders only.

## Brand Isolation

Brand isolation is currently enforced in code by `brandId`:

- Brand JSON loaded from `backend/data/brands/{brandId}.json`.
- Orders filtered by `brandId`.
- Shopify demo products/orders loaded by `brandId`.
- Knowledge vector store search filters chunks by `brandId`.
- Upload paths are namespaced by `brandId`.

Known limitation:
Protected dashboard endpoints validate Clerk authentication but do not yet enforce Clerk organization/brand permissions. Any authenticated dashboard user can currently request any configured brand ID. This must be fixed before real multi-client production.

## Data Exposure Rules

`/api/brand-config/:brandId` must expose only public fields:

- Brand name.
- Widget title.
- Welcome message.
- Theme color.
- Position.
- Quick replies.

It must not expose:

- Policies.
- FAQs.
- Manager contact.
- Escalation rules.
- Internal notes.
- Private documents.

## Security Recommendations

Critical before real production:

- Add brand/team authorization mapping.
- Add persistent user/organization database.
- Move logs and uploads out of local filesystem.
- Add audit logs for dashboard actions.
- Add request IDs and structured logging.
- Add upload malware scanning if handling real documents.
- Add stricter file extension/MIME validation using content sniffing.
- Add per-brand rate limits.

