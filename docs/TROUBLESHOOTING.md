# Troubleshooting

## Vercel Issues

### Build fails

Fix:

1. Confirm correct root directory.
2. Run build locally.
3. Check Node version.
4. Confirm `package-lock.json` is committed.
5. Check Vercel env variables.

Dashboard root:

```text
teviq-support-ai/dashboard
```

Website root:

```text
/Users/shivanshgupta/Documents/teviq site
```

### Dashboard shows login but pages fail

Likely backend protected API issue.

Check:

- Clerk token is sent.
- CORS allows dashboard origin.
- Backend `CLERK_SECRET_KEY` is configured.

## Render Issues

### Backend sleeps or slow first response

Render free/low-tier services can cold start. Test with:

```bash
curl https://teviq-support-ai-backend.onrender.com/health
```

### Backend crashes on deploy

Check:

- `npm install` completed.
- `npm start` uses `node server.js`.
- Node version is compatible with `@clerk/backend`.
- Env variables are configured.

## Clerk Issues

### 401 Authentication is required

No Authorization header was sent.

Fix frontend token attachment.

### 401 Invalid or expired token

Authorization header exists, but token verification failed.

Fix:

- Ensure frontend publishable key and backend secret key are from same Clerk environment.
- Sign out/sign in again.
- Check production vs test keys.

### Demo login appears in production

This should not happen.

Check:

- `import.meta.env.PROD`.
- Vercel production build.
- `VITE_ENABLE_DEMO_LOGIN`.

## Environment Variable Issues

### AI replies always fallback

Check:

- `GEMINI_API_KEY`
- `GROQ_API_KEY`
- Model names.
- Provider API availability.

### Protected APIs return 503

Check:

- `CLERK_SECRET_KEY`

### CORS blocked

Check:

- `ALLOWED_ORIGINS`
- Origin spelling.
- Protocol `https://` vs `http://`.
- `www` vs apex domain.

## Node/npm Issues

### `ENOSPC`

Disk full.

Fix:

```bash
df -h
npm cache clean --force
```

Free disk space before running `npm install`.

### macOS `Operation timed out` reading local files

This can happen when files are in iCloud/dataless state or disk is full.

Fix:

- Free disk space.
- Ensure project folder is fully local.
- Avoid running builds while files are not hydrated.

## Widget Issues

### Bubble appears slowly

Check:

- Website has preconnect/preload for widget/backend domains.
- Script is not lazy-loaded only after scroll.
- Backend is not cold-starting.

### Widget does not send messages

Check:

- `data-api-url`.
- Network `POST /api/chat`.
- CORS for website origin.
- Backend health.

### Wrong brand theme

Check:

- `data-brand-id`.
- `GET /api/brand-config/:brandId`.
- Brand JSON `widgetConfig`.

### Mobile keyboard cuts panel

Check:

- CSS media query `max-width: 640px`.
- `100dvh` support.
- `visualViewport` handling.
- Body scroll lock.

## Knowledge Issues

### Uploaded document appears but answers do not use it

Check:

- Retrieval confidence.
- Chunk content.
- Source document text extraction.
- Query wording.

### Delete document does not update UI

Check:

- Dashboard reloads document list after delete.
- Backend vector store removes both document and chunks.

## Shopify Demo Issues

### Status not connected

Check:

- Files exist under `backend/data/shopify-demo`.
- File names match `{brandId}-products.json` and `{brandId}-orders.json`.

### Cross-brand order appears

This is a critical bug. Check `brandId` filtering in:

- `shopifyDemo.provider.js`
- `order.service.js`

