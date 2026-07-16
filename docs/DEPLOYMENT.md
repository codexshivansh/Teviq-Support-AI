# Deployment

## Deployment Surfaces

| Component | Platform | Build command | Start/output |
| --- | --- | --- | --- |
| Backend | Render | `npm install` | `npm start` |
| Dashboard | Vercel | `npm run build` | `dist/` |
| Widget | Vercel/Netlify/Cloudflare/static CDN | none or static deploy | static files |
| Website | Vercel | `npm run build` | `dist/` |

## Backend on Render

Root directory:

```text
teviq-support-ai/backend
```

Build command:

```bash
npm install
```

Start command:

```bash
npm start
```

Required environment variables:

```text
NODE_ENV=production
PORT=<Render provided or 5000>
ALLOWED_ORIGINS=https://teviq.in,https://www.teviq.in,https://teviq-support-ai-dashboard-ph9p.vercel.app,http://localhost:5173,http://localhost:3000
CLERK_SECRET_KEY=<CLERK_SECRET_KEY>
GEMINI_API_KEY=<GEMINI_API_KEY>
GROQ_API_KEY=<GROQ_API_KEY>
GEMINI_MODEL=gemini-3.5-flash
GEMINI_EMBEDDING_MODEL=gemini-embedding-2
GROQ_MODEL=openai/gpt-oss-20b
ENABLE_DEMO_LOGIN=false
```

Health check:

```bash
curl https://teviq-support-ai-backend.onrender.com/health
```

## Dashboard on Vercel

Root directory:

```text
teviq-support-ai/dashboard
```

Build command:

```bash
npm run build
```

Output directory:

```text
dist
```

Environment variables:

```text
VITE_CLERK_PUBLISHABLE_KEY=<CLERK_PUBLISHABLE_KEY>
VITE_ENABLE_DEMO_LOGIN=false
```

Important:

- Production users should not see Demo Login.
- Dashboard requests to protected APIs must include `Authorization: Bearer <jwt>`.
- Backend `CLERK_SECRET_KEY` must match the same Clerk instance as the frontend publishable key.

## Widget Static Hosting

Root directory:

```text
teviq-support-ai/widget
```

Files to host:

- `widget.js`
- `index.html`
- `demo.html`
- `demo-vastra.html`
- `demo-urban.html`
- `demo-beauty.html`

There is no build step.

Production widget URL currently used:

```text
https://teviq-support-ai-widget.vercel.app/widget.js
```

## Website on Vercel

Root directory:

```text
/Users/shivanshgupta/Documents/teviq site
```

Build command:

```bash
npm run build
```

Output directory:

```text
dist
```

The website embeds the production widget in `index.html`.

## Common Deployment Issues

### Dashboard shows 401

Likely causes:

- Frontend is not sending `Authorization`.
- Clerk frontend/backend keys are from different Clerk instances.
- Backend `CLERK_SECRET_KEY` is missing or invalid.
- User session expired.

### Browser shows CORS preflight 403

Likely causes:

- Origin missing from `ALLOWED_ORIGINS`.
- Preview deployment URL blocked.
- Credentials used with wildcard CORS.

Current CORS supports:

- Explicit allowed origins.
- `https://*.vercel.app` preview pattern.
- Credentials.
- `Authorization` and `Content-Type` headers.

### Widget config fails on website

Likely causes:

- Website origin not allowed by backend CORS.
- Backend sleeping/cold start.
- Wrong `data-api-url`.
- Wrong `data-brand-id`.

## Rollback

Backend:

- Use Render deploy history and roll back to previous successful deploy.
- Confirm `/health`.
- Confirm `/api/chat`.

Vercel:

- Use Vercel deployment history.
- Promote a previous deployment.
- Confirm dashboard or website loads.

Widget:

- If widget deployment breaks client sites, roll back the static deployment immediately.
- Because clients load `widget.js` directly, a bad widget release has immediate customer impact.
