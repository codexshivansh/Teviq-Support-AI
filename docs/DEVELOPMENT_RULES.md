# Development Rules

## Product Rules

- Do not treat `teviq.in` as the client support product.
- `teviq.in` is the marketing website.
- The widget is for client e-commerce/D2C storefronts.
- All support behavior must be scoped by `brandId`.
- AI must not invent order status, refund status, delivery dates, or policy approvals.
- Hard escalation must bypass AI.

## Backend Rules

- Keep `/api/chat` response shape stable.
- Keep public widget endpoints public.
- Keep protected dashboard endpoints protected.
- Never weaken Clerk authentication.
- Never use `origin: "*"` with credentials.
- Validate `brandId`.
- Always filter order/product/knowledge data by `brandId`.
- Add tests/scripts for new brain behavior.

## Widget Rules

- Keep it frameworkless.
- Keep CSS prefixed with `teviq-`.
- Read `data-brand-id`.
- Read `data-api-url`.
- Do not require React/Vite.
- Do not break mobile fullscreen behavior.
- Do not change backend API contract.
- Always preserve plain text fallback if cards cannot render.

## Dashboard Rules

- Do not put secrets in `VITE_*`.
- Real logged-in users should send `Authorization: Bearer <jwt>`.
- Real logged-in users should not send `x-teviq-demo-auth`.
- Demo login must stay disabled in production.
- Brand selector state can persist in localStorage.
- Static demo analytics/settings must be clearly understood as demo-only.

## Website Rules

- Keep marketing claims honest.
- Do not add fake testimonials.
- Do not add fake client logos.
- Keep widget preload/embed intact unless intentionally changed.
- Keep SEO metadata updated when major copy changes.

## Data Rules

- Do not commit real customer data.
- Do not commit real uploaded brand documents.
- Do not commit production chat logs.
- Use demo data for demo brands only.
- When adding sample orders, include `brandId`.

## Security Rules

- Never commit `.env`.
- Never commit real API keys.
- Never expose `CLERK_SECRET_KEY`.
- Rotate leaked keys immediately.
- Keep protected endpoints behind `requireClerkAuth`.
- Keep CORS whitelist-based.

## Documentation Rules

Update docs when changing:

- Routes.
- Environment variables.
- Deployment steps.
- Auth flow.
- Widget embed format.
- Brand JSON schema.
- Knowledge retrieval behavior.
- Shopify connector behavior.

