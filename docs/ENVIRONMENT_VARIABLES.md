# Environment Variables

Do not commit real values. Use placeholders in docs and `.env.example`.

## Backend

Location:

```text
teviq-support-ai/backend/.env
```

| Variable | Purpose | Used by | Required | Secret | Example |
| --- | --- | --- | --- | --- | --- |
| `PORT` | HTTP port | `server.js` | No | No | `5000` |
| `NODE_ENV` | Runtime mode | env, CORS, auth middleware | Yes in deployment | No | `production` |
| `ALLOWED_ORIGINS` | Comma-separated allowed browser origins | `config/cors.js` | Yes in production | No | `https://teviq.in,https://dashboard.example.com` |
| `GEMINI_API_KEY` | Gemini API key | `services/ai.service.js` | No, but AI quality depends on it | Yes | `<GEMINI_API_KEY>` |
| `GEMINI_MODEL` | Gemini model name | `services/ai.service.js` | No | No | `gemini-1.5-flash` |
| `GROQ_API_KEY` | Groq API key | `services/ai.service.js` | No, fallback depends on it | Yes | `<GROQ_API_KEY>` |
| `GROQ_MODEL` | Groq model name | `services/ai.service.js` | No | No | `llama-3.1-8b-instant` |
| `CLERK_SECRET_KEY` | Verifies Clerk JWTs | `middleware/clerkAuth.middleware.js` | Yes for protected APIs | Yes | `<CLERK_SECRET_KEY>` |
| `ENABLE_DEMO_LOGIN` | Enables backend demo auth bypass in non-production | `middleware/clerkAuth.middleware.js` | No | No | `false` |

Important:

- Missing Gemini/Groq keys do not crash startup. The backend warns and returns safe fallbacks.
- Missing `CLERK_SECRET_KEY` in production causes protected APIs to return `503 auth_not_configured`.
- `ENABLE_DEMO_LOGIN` should be `false` or omitted in production. Demo bypass is blocked by `NODE_ENV=production` anyway, but keep config explicit.

## Dashboard

Location:

```text
teviq-support-ai/dashboard/.env
```

| Variable | Purpose | Used by | Required | Secret | Example |
| --- | --- | --- | --- | --- | --- |
| `VITE_CLERK_PUBLISHABLE_KEY` | Clerk frontend publishable key | `src/auth/authConfig.js`, `src/main.jsx` | Yes for real auth | No, but environment-specific | `<CLERK_PUBLISHABLE_KEY>` |
| `VITE_ENABLE_DEMO_LOGIN` | Enables demo login only when not production | `src/auth/authConfig.js` | No | No | `true` |

Notes:

- Vite exposes `VITE_*` variables to the browser. Do not put secrets in dashboard env variables.
- Production should use a Clerk live publishable key if this is a real production environment.
- The dashboard API base URL is currently hardcoded in `src/services/api.js` as `https://teviq-support-ai-backend.onrender.com`.

## Widget

The widget uses script tag attributes instead of build-time environment variables:

```html
<script
  src="https://teviq-support-ai-widget.vercel.app/widget.js"
  data-brand-id="CLIENT_BRAND_ID"
  data-api-url="https://teviq-support-ai-backend.onrender.com">
</script>
```

Attributes:

| Attribute | Purpose | Required | Example |
| --- | --- | --- | --- |
| `data-brand-id` | Selects brand config/data | Yes | `urban-demo` |
| `data-api-url` | Backend base URL | Yes in production | `https://teviq-support-ai-backend.onrender.com` |

## Marketing Website

The current website uses direct constants in `index.html` for widget preload/embed:

- Widget URL: `https://teviq-support-ai-widget.vercel.app/widget.js`
- Brand ID: `vastra-demo`
- API URL: `https://teviq-support-ai-backend.onrender.com`

No website `.env.example` was identified in the current code.

## Secret Handling Rules

- Never paste real API keys into documentation.
- Never commit `.env`.
- Never expose `CLERK_SECRET_KEY`.
- Never expose Gemini/Groq keys in frontend code.
- Rotate any key that was accidentally committed.

