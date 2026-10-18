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

1. Create the brand through protected onboarding or `brand.service.js`; runtime brands persist in Supabase.
2. Confirm the Clerk user receives the same `brandId` in public metadata.
3. Add knowledge and optional Shopify connection from the dashboard.
4. Test `GET /api/brand-config/{brandId}`.
5. Test `POST /api/chat` with the new brand ID.
6. Add a local JSON/demo catalog only when building a deliberate demo workspace.

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
3. Check the brand's Supabase `chat_logs` rows or the protected Conversations page.
4. If Knowledge Brain is involved, call `/api/knowledge/:brandId/retrieve`.
5. If AI is involved, check the Groq key configuration. Gemini customer-data calls are disabled; knowledge retrieval is local lexical matching.

## Local Development Notes

- The backend is CommonJS.
- The dashboard and website are ESM/Vite.
- The widget is plain browser JavaScript.
- Dashboard API defaults to Render and supports a `VITE_API_BASE_URL` override.
- Local JSON under `data/` is demo/fallback data, not production persistence.
