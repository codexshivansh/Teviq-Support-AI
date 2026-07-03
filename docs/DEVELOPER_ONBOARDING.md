# Developer Onboarding

## Who This Is For

This guide is for the next primary technical owner of Teviq Support AI.

You should be comfortable with:

- Node.js and Express.
- React/Vite.
- TailwindCSS.
- Browser APIs and plain JavaScript.
- Basic AI API integrations.
- Clerk authentication.
- Deployment on Vercel and Render.

## Local Repository Setup

Main product repo:

```bash
cd "/Users/shivanshgupta/Documents/AI Support bot/teviq-support-ai"
```

Marketing website:

```bash
cd "/Users/shivanshgupta/Documents/teviq site"
```

## Backend Setup

```bash
cd "/Users/shivanshgupta/Documents/AI Support bot/teviq-support-ai/backend"
npm install
cp .env.example .env
npm run dev
```

Backend default URL:

```text
http://localhost:5000
```

Health check:

```bash
curl http://localhost:5000/health
```

Recommended checks:

```bash
npm run validate:brands
npm run test:brain
npm run test:knowledge
npm run test:shopify-demo
npm run smoke:test
```

## Dashboard Setup

```bash
cd "/Users/shivanshgupta/Documents/AI Support bot/teviq-support-ai/dashboard"
npm install
cp .env.example .env
npm run dev
```

Dashboard default Vite URL:

```text
http://localhost:5173
```

Set `VITE_CLERK_PUBLISHABLE_KEY` for real Clerk auth.

In local/dev mode, demo login can be enabled with:

```text
VITE_ENABLE_DEMO_LOGIN=true
```

Do not rely on demo login in production.

## Widget Setup

The widget does not require a build step.

Open demo pages directly in a browser or serve the `widget/` folder with any static server:

```bash
cd "/Users/shivanshgupta/Documents/AI Support bot/teviq-support-ai/widget"
python3 -m http.server 8080
```

Then open:

```text
http://localhost:8080/index.html
```

## Website Setup

```bash
cd "/Users/shivanshgupta/Documents/teviq site"
npm install
npm run dev
```

The website embeds the production widget from `index.html`.

## Suggested First-Day Reading Order

1. `docs/PROJECT_OVERVIEW.md`
2. `docs/ARCHITECTURE.md`
3. `docs/SYSTEM_FLOW.md`
4. `backend/brain/supportBrain.js`
5. `backend/brain/toolRouter.js`
6. `backend/services/ai.service.js`
7. `backend/knowledge/retrieval.service.js`
8. `dashboard/src/services/api.js`
9. `dashboard/src/auth/AuthContext.jsx`
10. `widget/widget.js`

## Common Development Tasks

### Add a New Brand

1. Create `backend/data/brands/{brandId}.json`.
2. Add demo orders/products if needed.
3. Run `npm run validate:brands`.
4. Test `GET /api/brand-config/{brandId}`.
5. Test `POST /api/chat` with the new brand ID.
6. Add dashboard selector entry in `dashboard/src/data/brands.js` if the dashboard should show it.

### Add or Tune an Intent

1. Update `backend/brain/intentEngine.js`.
2. If system tool behavior is needed, update `backend/brain/toolRouter.js`.
3. Add policy or service logic if required.
4. Add a case to `backend/scripts/test-brain.js`.
5. Test widget card rendering if a new intent needs special UI.

### Add a Knowledge Document

Use Dashboard Knowledge Base or call:

```bash
curl -X POST "$API/api/knowledge/urban-demo/upload" \
  -H "Authorization: Bearer <CLERK_JWT>" \
  -F "document=@policy.pdf" \
  -F "title=Policy"
```

### Debug a Customer Reply

1. Check `/api/chat` response fields.
2. Check intent and warnings.
3. Check `backend/logs/chat-logs.json`.
4. If Knowledge Brain is involved, call `/api/knowledge/:brandId/retrieve`.
5. If AI is involved, check Gemini/Groq key configuration.

## Local Development Notes

- The backend is CommonJS.
- The dashboard and website are ESM/Vite.
- The widget is plain browser JavaScript.
- The dashboard API base URL is currently hardcoded to the Render backend in `dashboard/src/services/api.js`.
- Local JSON storage is not suitable for multi-instance production persistence.

