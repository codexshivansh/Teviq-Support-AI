# Database and Storage

## Current Production State

Supabase is the persistent system of record for multi-brand runtime data. Local JSON remains only for demo fixtures and legacy fallback orders.

All server-side Supabase access uses `SUPABASE_SERVICE_ROLE_KEY`. The key must never be exposed to the dashboard, widget, or website.

## Brands

Table:

```text
public.brands
```

Primary key:

```text
id
```

Important fields include brand name/category, language, active state, widget settings, contact details, business hours, and Shopify connection display fields.

`services/brand.service.js` provides brand lookup/create/update/existence operations. Public widget config is allowlisted by `getPublicBrandConfig()` and never returns secrets.

The three JSON brand files under `data/brands/` are seed/demo references, not runtime production persistence.

## Knowledge Documents

Original uploaded files are stored in a private Supabase Storage bucket:

```text
knowledge-documents
```

The bucket can be changed with `SUPABASE_KNOWLEDGE_BUCKET`.

Object path:

```text
{brandId}/{documentId}.{extension}
```

Rules:

- PDF, DOCX, and TXT only.
- Maximum 10 MB.
- Bucket is private.
- An existing public bucket fails closed before any upload.
- Object paths are validated and brand-scoped.
- Upload bytes are held in memory only during extraction/upload.
- The dashboard-visible document row is written only after chunks persist.
- If persistence fails, chunks, metadata, and the newly stored object are
  removed through compensating cleanup.
- Document deletion removes the Storage object through the Storage API before deleting metadata/chunks.

Document metadata:

```text
public.knowledge_documents
```

Vector chunks:

```text
public.knowledge_chunks
```

Structured policies and FAQs are stored in:

```text
public.structured_knowledge
```

Their chunks are indexed into the same `knowledge_chunks` table with `source_type=policy` or `source_type=faq`.

## Retrieval

- Current retrieval: local lexical matching over brand-scoped Supabase knowledge text.
- New writes store deterministic 768-dimensional local compatibility features; these are not semantic embeddings.
- The legacy pgvector RPC and stored vectors remain in the database but are not used by the current retrieval path.
- Default returned context: top 5 chunks.
- Candidate fetch: paginated brand-scoped text reads, up to 10,000 chunks; retrieval fails closed if the scan would exceed that bound.
- Confidence values are lexical heuristics. High-risk and low-confidence answers fail safely.
- Source results retain FAQ, policy, and document citations.
- Chunk maximum: 1,100 characters.
- Chunk overlap: 140 characters.
- Minimum chunk target: 120 characters.

Every lexical query is filtered by `brand_id` in Supabase and each returned row is checked against the requested brand before ranking.

## Conversations and Analytics

Chat events:

```text
public.chat_logs
```

Stored fields include brand/customer IDs, message/reply, intent, escalation, source, knowledge confidence/citations, fallback flag, response time, and timestamp.

Dashboard conversation history and analytics are projections of this table. Conversation grouping uses a 30-minute inactivity gap.

Persistent workflow state:

```text
public.conversation_states
```

This stores brand/customer/channel state for order verification, product narrowing, and related follow-ups.

Prompt memory is bounded to 10 messages. Warm sessions use an in-process fast path; after a backend restart or instance change, `memory.service.js` hydrates the last five completed turns from brand/customer-scoped `chat_logs`. A short timeout and local fallback keep chat available if Supabase is temporarily unavailable.

## Shopify

Persistent Shopify tables:

- `shopify_connections`
- `shopify_oauth_states`
- `shopify_products`
- `shopify_orders`
- `shopify_webhook_events`

The cache stores support-safe product/order fields and avoids copying customer email, phone, or address. Live order verification queries Shopify for matching contact identity and does not log the submitted contact.

Local `data/shopify-demo/*` and `data/orders.json` remain demo/fallback fixtures only.

## Other Persistent Tables

The migration folder also defines brand-scoped records for leads, return/cancellation requests, alert idempotency, and related operational state.

## Backup and Migration Rules

- Apply files in `supabase/migrations/` in deployment order.
- Treat Supabase Storage schema tables as read-only; manage objects through the Storage API.
- Never change embedding dimensions without a new vector column/RPC and backfill plan.
- Never remove a legacy column until the new backend version and backfill are verified.
- Keep every runtime table query scoped by `brand_id` where the table is multi-tenant.
- Back up production data before destructive migrations.
