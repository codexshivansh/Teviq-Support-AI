# Deployment SOP

## Pre-Deployment Checklist

Run from `teviq-support-ai/backend`:

```bash
npm install
npm run validate:brands
npm run test:brain
npm run test:knowledge
npm run test:shopify-demo
node -c server.js
node -c config/cors.js
node -c middleware/clerkAuth.middleware.js
```

Run from `teviq-support-ai/dashboard`:

```bash
npm install
npm run build
```

Run from marketing site:

```bash
cd "/Users/shivanshgupta/Documents/teviq site"
npm install
npm run build
```

Widget:

- Open `widget/demo-vastra.html`, `widget/demo-urban.html`, and `widget/demo-beauty.html`.
- Confirm widget opens and can call the target backend.

## Backend Deployment Steps

1. Push backend changes to the connected GitHub repository/branch.
2. Open Render service.
3. Confirm root directory is `backend`.
4. Confirm env variables.
5. Trigger deploy.
6. Wait for logs to show backend running.
7. Test:

```bash
curl https://teviq-support-ai-backend.onrender.com/health
SMOKE_TEST_URL=https://teviq-support-ai-backend.onrender.com npm run smoke:test
```

8. Test protected endpoint:

```bash
curl https://teviq-support-ai-backend.onrender.com/api/knowledge/urban-demo/documents
```

Expected without JWT:

```json
{
  "error": "unauthorized",
  "message": "Authentication is required."
}
```

## Dashboard Deployment Steps

1. Push dashboard changes.
2. Open Vercel project.
3. Confirm root directory is `dashboard`.
4. Confirm `VITE_CLERK_PUBLISHABLE_KEY`.
5. Confirm `VITE_ENABLE_DEMO_LOGIN=false` for production.
6. Deploy.
7. Open dashboard.
8. Sign in with Clerk.
9. Confirm no authentication banner.
10. Confirm Knowledge and Shopify pages load.

## Widget Deployment Steps

1. Push widget changes.
2. Deploy static folder.
3. Open:

```text
https://teviq-support-ai-widget.vercel.app/index.html
```

4. Test all demo pages.
5. Test production embed snippet.

## Website Deployment Steps

1. Push marketing website changes.
2. Deploy on Vercel.
3. Open `https://teviq.in`.
4. Test hero, navbar, pricing, live demo, footer.
5. Confirm widget bubble appears quickly.
6. Confirm no missing asset 404s.

## Production Smoke Tests

### Public

```bash
curl https://teviq-support-ai-backend.onrender.com/health
curl https://teviq-support-ai-backend.onrender.com/api/brand-config/urban-demo
```

### Chat

```bash
curl -X POST https://teviq-support-ai-backend.onrender.com/api/chat \
  -H "Content-Type: application/json" \
  -d '{"brandId":"urban-demo","message":"Do products have warranty?","customerId":"smoke"}'
```

### CORS Preflight

```bash
curl -i -X OPTIONS https://teviq-support-ai-backend.onrender.com/api/knowledge/urban-demo/documents \
  -H "Origin: https://teviq-support-ai-dashboard-ph9p.vercel.app" \
  -H "Access-Control-Request-Method: GET" \
  -H "Access-Control-Request-Headers: Authorization, Content-Type"
```

Expected:

- HTTP 204 or allowed preflight.
- `access-control-allow-credentials: true`.
- Origin-specific CORS allow header.

## Rollback SOP

If backend fails:

1. Roll back in Render.
2. Confirm `/health`.
3. Confirm `/api/chat`.
4. Confirm protected endpoints still require auth.

If widget fails:

1. Roll back immediately in static hosting.
2. Open demo pages.
3. Verify client embed URL serves the older working `widget.js`.

If dashboard fails:

1. Roll back in Vercel.
2. Confirm Clerk login.
3. Confirm Knowledge/Shopify protected APIs.

