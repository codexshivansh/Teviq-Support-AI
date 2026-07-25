# Technical Debt

This file records real remaining engineering debt. Items already solved in production code are listed separately so they are not mistaken for launch blockers.

## Critical

No known code-side critical issue remains for a controlled pilot launch.

External launch checks such as Shopify protected-customer-data approval, production environment verification, and a real order-verification test remain in `MARKET_LAUNCH_MANUAL_TASKS.md`.

## High

### Authenticated Production E2E Is Still Manual

Widget interactions are covered by Playwright and public production URLs have automated health checks. Clerk-protected dashboard flows still require a real Clerk browser session, so login expiry, live JWT attachment, and production tenant metadata are verified manually.

Next step:

- Add a dedicated non-production Clerk test tenant and Playwright auth state.
- Never store production credentials in the repository.

### Resolution Is Not an Explicit Event

Analytics can reliably count conversations, intents, fallback answers, response time, and escalations from `chat_logs`. A non-escalated conversation is not automatically proof that the customer issue was resolved.

Next step:

- Add explicit resolved/unresolved feedback or operator status.
- Add CSAT only after a real resolution signal exists.

## Medium

### Prompt Memory Reuses Analytics History

Prompt memory hydrates from the last five brand/customer-scoped `chat_logs` rows and then uses an in-process fast path. This avoids another database table, but it couples prompt context to analytics retention and does not have a channel column.

Next step:

- Introduce one conversation repository with explicit channel and message-retention policies when additional customer channels are added.
- Keep contact-verification values redacted and outside prompt history.

### Demo Commerce Fallbacks Remain

Local demo products/orders and `orders.json` remain for the three demo brands. Live Shopify-connected brands use the Supabase cache and verified order flow.

Risk:

- Future changes must not let demo fallback data answer for a live brand.
- Keep all lookups brand-scoped and covered by cross-brand tests.

### Widget Source Is a Large Frameworkless File

The shipped widget intentionally has no framework runtime, but UI, CSS, rendering, and transport code live in one source file.

Next step:

- Keep the output as one embeddable file.
- Split development source into modules only when a bundling/release pipeline is introduced.
- Preserve the Playwright suite and immutable release manifest.

### Backend Supabase Access Is Repeated

Several services call Supabase REST directly with similar timeout/header/error handling.

Next step:

- Consolidate transport behavior behind a small server-only repository client.
- Keep service interfaces and SQL-side brand filters unchanged.

### Test Harness Is Mixed

Backend regression coverage is implemented as deterministic Node scripts; the widget uses Playwright. This is effective but not a single unified test framework.

Next step:

- Migrate only when shared fixtures, coverage reporting, or parallel unit testing provide clear value.

## Low

### Repository History Is Split

Backend, dashboard, widget, and website are independent Git repositories. This supports independent deployments but requires coordinated release notes when a change spans multiple surfaces.

### Dashboard Routing Is Custom

`src/App.jsx` maps dashboard routes without React Router. It works at current scale but will become harder to maintain if nested routes or route-level loaders are added.

### Legacy Intent Service

The active intent implementation is `brain/intentEngine.js`. Any remaining legacy intent helper should either be documented as compatibility code or removed after import verification.

## Resolved Production Risks

- Brand records persist in Supabase instead of runtime JSON files.
- Clerk-authenticated dashboard routes enforce assigned-brand access; only `teviq_admin` can switch brands.
- Knowledge metadata/chunks persist in Supabase Postgres with pgvector and SQL-side `brand_id` filtering.
- Original PDF/DOCX/TXT files persist in a private, brand-scoped Supabase Storage bucket.
- Gemini Embedding 2 produces 768-dimensional semantic vectors.
- Chat analytics and conversation history persist in Supabase `chat_logs`.
- Shopify OAuth tokens are encrypted; operational webhooks are HMAC-verified and deduplicated.
- Live Shopify order lookup requires order plus matching contact verification and rate limits failed attempts.
- Dashboard API URL supports `VITE_API_BASE_URL`.
- CI exists for backend, dashboard, website, and widget.
- The widget has an immutable `v1.0.0` release, stable alias, release-integrity check, and Playwright interaction tests.

## Next Engineering Order

1. Complete the real production order-verification test.
2. Persist general prompt memory with a short TTL.
3. Add a true resolution/CSAT signal.
4. Add authenticated dashboard E2E in a dedicated test environment.
5. Add billing and usage enforcement only when commercial plans are finalized.
