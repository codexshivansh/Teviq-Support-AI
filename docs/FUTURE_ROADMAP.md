# Future Roadmap

The current system is suitable for a controlled pilot after the manual launch gate passes. This roadmap starts from the code that exists today rather than the original JSON-only MVP.

## Pilot Stabilization

- Complete real Shopify order verification with correct and incorrect contact details.
- Verify all Render, Vercel, Clerk, Supabase, Gemini, Groq, and Shopify production variables.
- Register and test Shopify compliance webhooks before Public Distribution.
- Run production health and retention workflows with notifications enabled.
- Launch with one controlled brand and review the first real conversations daily.

## Product Reliability

- Persist general conversation memory with a short brand/customer TTL.
- Add explicit resolution, unresolved, and CSAT events.
- Add a missed-question queue that points to the exact knowledge gap.
- Add authenticated dashboard browser E2E in a dedicated test tenant.
- Add per-brand operational limits for chats, uploads, and AI usage.

## Knowledge Operations

- Add document versions and replacement history.
- Add source precedence controls when Shopify policy and uploaded knowledge conflict.
- Add knowledge freshness/expiry reminders.
- Add website crawling, Notion import, and product knowledge ingestion through the existing ingestion interface.
- Add retrieval evaluation sets per brand before changing models or thresholds.

## Commerce

- Finish Shopify Public Distribution review and protected-customer-data approval.
- Add WooCommerce through the same connector/tool contracts.
- Add inventory-aware recommendations and richer variant metadata.
- Add operator-visible sync/webhook diagnostics without exposing credentials.
- Keep order responses identity-verified and brand-scoped across every connector.

## Channels

- Add WhatsApp as a channel adapter feeding the same Support Brain.
- Add email and Instagram DM only after conversation state and human handoff are channel-neutral.
- Keep escalation, policy, and data-isolation rules identical across channels.

## SaaS Operations

- Add organizations, team invitations, and role-based permissions.
- Add plan definitions, metering, billing, and enforcement.
- Add audit logs for settings, knowledge, integrations, and user access.
- Add self-serve export/delete and retention controls.
- Add production SLA, incident, and status-page processes.

## AI Operations

- Add prompt/version tracking and evaluation before rollout.
- Track provider cost and latency by brand without exposing internal prompts.
- Add automated groundedness checks for high-risk order/refund/policy intents.
- Keep Gemini/Groq providers swappable behind the current service boundary.

## Product Rules That Do Not Change

- AI never invents order status, refund confirmation, dates, or policy approval.
- Fraud, legal threats, violence, and abuse bypass generative AI and escalate.
- Every database and retrieval query is brand-scoped on the server.
- Customer order data is shown only after identity verification.
- Widget config exposes only public fields.
- New integrations enter through a connector/tool boundary, not directly inside controllers.
