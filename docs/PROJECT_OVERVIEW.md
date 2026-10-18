# Project Overview

## Product

Teviq Support AI is a multi-brand AI support system for e-commerce and D2C brands. `teviq.in` is its marketing website, not the only supported brand.

A client installs one frameworkless script. It sends a public `brandId` to the backend, which validates the active brand and uses only that brand's policies, FAQs, documents, Shopify cache, settings, and escalation contacts.

## Current Surfaces

| Surface | Responsibility | Hosting |
| --- | --- | --- |
| Backend | Express API, Support Brain, Knowledge Brain, policy/order/security rules | Render |
| Dashboard | Clerk-protected brand admin, onboarding, knowledge, Shopify, analytics | Vercel |
| Widget | Customer-facing plain JS/CSS support panel | Vercel/static CDN |
| Website | Marketing, demo booking, live Teviq widget | Vercel |

Production URLs:

- API: `https://teviq-support-ai-backend.onrender.com`
- Dashboard: `https://dashboard.teviq.in`
- Widget: `https://teviq-support-ai-widget.vercel.app/v1.1.0/widget.js`
- Website: `https://teviq.in`

## Customer Flow

```text
Customer
  -> embedded widget
  -> POST /api/chat with brandId + customerId
  -> active brand validation
  -> analysis, intent and entity extraction
  -> order/policy/knowledge/lead/escalation tools
  -> Groq generation when allowed; grounded local/system fallback otherwise
  -> response validator
  -> widget response
  -> Supabase chat analytics
```

Hard fraud, legal, violence, and abuse escalation bypasses generative AI. Order status is never invented. Live Shopify order information requires order plus matching email/phone verification.

## Brand Owner Flow

```text
Clerk login
  -> assigned brand metadata
  -> server-side requireBrandAccess
  -> dashboard APIs
  -> knowledge, conversations, analytics, settings and Shopify
```

Normal users cannot select or fetch another brand. `teviq_admin` can switch workspaces. Missing brand metadata blocks normal users instead of falling back to a demo brand.

## Persistent Data

Supabase stores:

- Brands and widget settings.
- Knowledge metadata, compatibility vectors, FAQs, and policies.
- Private original PDF/DOCX/TXT files through Supabase Storage.
- Conversation workflow state.
- Chat logs, conversation history, analytics, leads, and support requests.
- Encrypted Shopify connections, OAuth state, support-safe cache, and webhook receipts.

Local JSON remains for demo products/orders and legacy fallback tests only.

## Knowledge Brain

- Supabase stores brand-scoped knowledge text and metadata.
- Current retrieval uses local lexical matching over the selected brand's stored text; no external embedding request is made.
- New compatibility vectors are local feature hashes, not semantic embeddings. Existing stored vectors are retained but are not used for current matching.
- FAQ/policy/document retrieval returns citations and heuristic confidence scores.
- Lexical matching can miss Hindi/Hinglish paraphrases without shared terms; low-confidence and high-risk answers fail safely instead of guessing.

See [Groq-only mode](./GROQ_ONLY_MODE.md) for rollout, tradeoffs, and verification details.

## Shopify

The live connector supports OAuth, encrypted offline tokens, reconciliation, operational webhooks, HMAC validation, deduplication, uninstall cleanup, and identity-verified order tracking. The demo connector remains for the three demo workspaces.

Public Shopify distribution still requires the external review/compliance tasks in `MARKET_LAUNCH_MANUAL_TASKS.md`.

## Widget Installation

```html
<script
  src="https://teviq-support-ai-widget.vercel.app/v1.1.0/widget.js"
  data-brand-id="CLIENT_BRAND_ID"
  data-api-url="https://teviq-support-ai-backend.onrender.com">
</script>
```

The versioned URL is immutable. `/widget.js` remains the moving stable/preview alias.

## Product Boundary

Ready after the controlled pilot launch gate:

- Multi-brand support widget.
- Brand-scoped knowledge and Shopify context.
- Clerk-protected dashboard.
- Conversation/analytics visibility.
- Safe escalation and order verification.

Not yet part of the paid production scope:

- WhatsApp/Instagram/email channels.
- Billing and plan enforcement.
- Team invitations and granular roles.
- Public Shopify App Store approval.
- Explicit CSAT/resolution workflow.

## First Reading Order

1. `docs/ARCHITECTURE.md`
2. `docs/SYSTEM_FLOW.md`
3. `brain/supportBrain.js`
4. `brain/toolRouter.js`
5. `knowledge/retrieval.service.js`
6. `integrations/shopify/shopifyIntegration.service.js`
7. `middleware/clerkAuth.middleware.js`
8. `middleware/brandAccess.middleware.js`
