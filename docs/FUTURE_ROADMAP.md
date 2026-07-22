# Future Roadmap

## Short-Term Improvements

### Production Hygiene

- Finalize canonical GitHub repo structure.
- Add CI checks.
- Clean duplicate/generated files.
- Ensure all deploy env vars are documented in hosting platforms.
- Add `VITE_API_BASE_URL` to dashboard.
- Add versioned widget hosting.

### Dashboard Reliability

- Add better protected API error states.
- Add installation verification.
- Add real conversation history API.
- Add real analytics API from backend logs/database.

### Support Brain

- Add state machine for collecting missing order IDs/contact info.
- Improve intent priority and confidence.
- Add regression tests for every important support flow.
- Add structured response fields from backend for widget cards instead of relying mostly on intent/reply parsing.

## Medium-Term Improvements

### Database

Move to Supabase/PostgreSQL:

- Brands.
- Users/orgs.
- Settings.
- Documents.
- Conversations.
- Messages.
- Leads.
- Analytics events.
- Shopify connections.

### Knowledge Brain

- Replace local vector store with Qdrant or pgvector.
- Add real semantic embeddings.
- Add document versioning.
- Add FAQ suggestion workflow based on missed questions.
- Add confidence/grounding dashboard.

### Shopify

- Build real Shopify OAuth.
- Store encrypted access tokens.
- Sync products/orders/customers.
- Register and verify the implemented mandatory Shopify compliance webhooks before Public Distribution review.
- Add installation flow in dashboard.

### Widget

- Add versioned CDN releases.
- Add structured response card contract.
- Add accessibility audit.
- Add visual regression tests.
- Add optional launcher customization per brand.

## Long-Term Improvements

### WhatsApp Channel

- Add WhatsApp adapter.
- Normalize WhatsApp messages into the same Support Brain flow.
- Add human handoff workflow.
- Add lead capture and escalation from WhatsApp.

### Enterprise Readiness

- Role-based access control.
- Audit logs.
- SLA monitoring.
- Data retention controls.
- Export/delete customer data.
- Security policies and compliance documentation.
- Per-tenant rate limits.
- Billing and plan enforcement.

### AI Operations

- Provider abstraction for Gemini/Groq/OpenAI/Claude.
- Cost tracking per brand.
- Prompt versioning.
- Response evaluation.
- Automated hallucination checks.
- Human review loop.

## Scaling Roadmap

Phase 1:
Stabilize deployment, docs, CI, and widget versioning.

Phase 2:
Add database and brand authorization.

Phase 3:
Convert local JSON services into database-backed services.

Phase 4:
Add real Shopify OAuth and synced commerce data.

Phase 5:
Add WhatsApp channel adapter.

Phase 6:
Add billing, plans, usage metering, and tenant admin.

Phase 7:
Add enterprise security, audit logs, and compliance workflows.
