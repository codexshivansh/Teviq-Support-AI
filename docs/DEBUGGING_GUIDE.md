# Debugging Guide

## Quick Triage

Ask:

1. Which surface is failing: website, widget, dashboard, or backend?
2. Is the endpoint public or protected?
3. Is the issue local or deployed?
4. Is there a CORS/preflight error?
5. Is there a 401/403?
6. Is the response coming from `system`, `gemini`, or `groq`?
7. Is the brand ID correct?

## Backend Health

```bash
curl http://localhost:5000/health
curl https://teviq-support-ai-backend.onrender.com/health
```

Expected:

```json
{
  "ok": true
}
```

## CORS Debugging

Symptoms:

- Browser says CORS error.
- Network tab shows failed `OPTIONS`.
- Backend logs may show blocked origin.

Check:

- Origin is in `ALLOWED_ORIGINS`.
- Vercel preview URL matches `https://*.vercel.app`.
- Credentials are allowed.
- `Authorization` and `Content-Type` are allowed headers.

Preflight test:

```bash
curl -i -X OPTIONS "$API/api/knowledge/urban-demo/documents" \
  -H "Origin: https://teviq-support-ai-dashboard-ph9p.vercel.app" \
  -H "Access-Control-Request-Method: GET" \
  -H "Access-Control-Request-Headers: Authorization, Content-Type"
```

## JWT / 401 Debugging

401 `Authentication is required` means:

- Request did not include `Authorization: Bearer <jwt>`.

401 `Invalid or expired authentication token` means:

- Header exists but token is invalid/expired.
- Clerk frontend/backend keys may not match.

503 `auth_not_configured` means:

- Backend `CLERK_SECRET_KEY` is missing.

Frontend code to inspect:

- `dashboard/src/auth/AuthContext.jsx`
- `dashboard/src/services/api.js`

Backend code to inspect:

- `backend/middleware/clerkAuth.middleware.js`

## Knowledge Upload Debugging

Common failures:

- Missing `document` field.
- Unsupported MIME type.
- File larger than 10MB.
- PDF/DOCX extraction returns no text.
- Protected API missing Clerk JWT.

Check:

- Supabase Storage bucket `knowledge-documents/{brandId}/`.
- Supabase `knowledge_documents` row.
- Supabase `knowledge_chunks` rows with the same `brand_id` and `document_id`.
- Render logs for extraction, embedding, Storage, or rollback errors.

Debug retrieval:

```bash
curl -X POST "$API/api/knowledge/urban-demo/retrieve" \
  -H "Authorization: Bearer <CLERK_JWT>" \
  -H "Content-Type: application/json" \
  -d '{"query":"Do earbuds have warranty?","topK":5}'
```

## Knowledge Retrieval Debugging

Important files:

- `knowledge/embedding.service.js`
- `knowledge/retrieval.service.js`
- `knowledge/vectorStore.service.js`

Key behavior:

- SQL RPC filters by `brandId`.
- Similarity is pgvector cosine similarity over Gemini Embedding 2 vectors.
- Candidate search uses `p_min_score=0`; application confidence gating starts at `0.68`.
- `topK` defaults to 5 after source-aware reranking.

If answer is too generic:

- Check confidence.
- Upload better source document.
- Ensure document text extraction worked.
- Add clearer policy/FAQ content.

## Shopify Debugging

Important files:

- `backend/integrations/shopify/shopifyIntegration.service.js`
- `backend/integrations/shopify/shopifyAdmin.provider.js`
- `backend/integrations/shopify/shopifyWebhook*.js`
- `backend/integrations/shopify/shopifyDemo.provider.js`
- `backend/services/order.service.js`
- `backend/services/product.service.js`

Checks:

```bash
npm run test:shopify-demo
```

If live sync fails:

- Confirm the connection is active and the store granted current scopes.
- Confirm protected customer data access before querying live orders.
- Check webhook registration status and Render logs.
- Use `Sync now` as reconciliation after scopes or permissions change.

If demo product recommendations are weak:

- Add relevant `keywords`.
- Add `recommendationText`.
- Ensure `available` is not `false`.

If order tracking fails:

- Check order exists in correct brand file.
- Check `brandId` matches.
- Check order ID format.

## Widget Debugging

Check script tag:

```html
<script
  src="https://teviq-support-ai-widget.vercel.app/v1.1.0/widget.js"
  data-brand-id="urban-demo"
  data-api-url="https://teviq-support-ai-backend.onrender.com">
</script>
```

Browser checks:

- Network: `GET /api/brand-config/:brandId`
- Network: `POST /api/chat`
- Console errors.
- Mobile viewport around 390px.
- Close/reopen.
- Suggested actions remain clickable.

## Build Failures

Common causes:

- Missing dependencies.
- Tailwind content glob scanning too much.
- Dataless/iCloud local files on macOS.
- Disk full.
- Node version mismatch.

Use:

```bash
df -h
node -v
npm -v
npm install
npm run build
```

Clerk backend dependency requires a modern Node version. Use Node 20+ for backend deployment.
