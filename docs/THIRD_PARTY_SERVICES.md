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
GEMINI_MODEL=gemini-1.5-flash
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
GROQ_MODEL=llama-3.1-8b-instant
```

Behavior:

- Called if Gemini fails.
- Timeout: 15 seconds.
- Temperature: 0.3.
- Max tokens: 350.

## Shopify

Current status:
Demo connector only.

Used by:

- Order lookup.
- Product recommendation.
- Dashboard Shopify Status page.

Files:

```text
backend/integrations/shopify/shopifyDemo.provider.js
backend/integrations/shopify/shopifySync.service.js
backend/data/shopify-demo/*
```

Future:
Replace demo provider with real Shopify OAuth/Admin API provider behind the same interface.

## GitHub

Purpose:
Source control and deployment trigger.

Current note:
Local Git history is fragmented across root/backend/widget/website. Decide canonical repo structure before long-term handoff.

## External Browser/CDN Runtime

The widget is loaded directly by client websites. Any hosted `widget.js` change affects all clients using that URL.

Recommendation:
Use versioned widget URLs in the future:

```text
https://cdn.teviq.in/widget/v1/widget.js
```

and maintain a stable alias:

```text
https://cdn.teviq.in/widget.js
```

