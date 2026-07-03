# Database and Storage

## Current State

There is no production database yet. Storage is local JSON and local filesystem.

This is acceptable for MVP/demo but not for a production multi-tenant SaaS.

## Brand Storage

Path:

```text
backend/data/brands/{brandId}.json
```

Required fields:

- `brandId`
- `brandName`
- `industry`
- `tone`
- `managerContact`
- `policies`
- `faqs`
- `widgetConfig`
- `escalationRules`

Validation:

```bash
cd backend
npm run validate:brands
```

## Order Storage

Fallback local orders:

```text
backend/data/orders.json
```

Shopify demo orders:

```text
backend/data/shopify-demo/{brandId}-orders.json
```

Rules:

- Every order should include `brandId`.
- `order.service.js` checks Shopify demo provider first.
- If not found, it falls back to `orders.json`.
- Cross-brand order leakage is blocked by `brandId` filtering.

## Product Storage

Shopify demo products:

```text
backend/data/shopify-demo/{brandId}-products.json
```

Products are used for:

- Shopify status page.
- Product recommendation intent.
- Demo connector architecture.

## Knowledge Upload Storage

Uploaded files:

```text
backend/uploads/knowledge/{brandId}/
```

Accepted file types:

- PDF
- DOCX
- TXT

Limits:

- 10MB max file size.
- One file per upload.

## Knowledge Vector Store

Path:

```text
backend/data/knowledge/vector-store.json
```

Shape:

```json
{
  "version": 1,
  "documents": [],
  "chunks": []
}
```

Document metadata includes:

- `brandId`
- `documentId`
- `title`
- `sourceName`
- `storedFileName`
- `mimeType`
- `extension`
- `sizeBytes`
- `uploadedAt`
- `chunkCount`
- extraction metadata

Chunk metadata includes:

- `brandId`
- `documentId`
- `sourceName`
- `title`
- `sectionTitle`
- `chunkIndex`
- `mimeType`
- `extension`
- `uploadedAt`

## Retrieval Settings

Implemented in:

```text
backend/knowledge
```

Current values:

- Embedding dimensions: `256`
- Chunk max size: `1100` characters
- Min chunk size: `120` characters
- Overlap: `140` characters
- Retrieval default: `topK=5`
- Minimum confidence: `0.16`
- High confidence: `0.34`
- Similarity: cosine similarity over normalized local hash vectors

## Conversation Memory

Current storage:

```text
backend/services/memory.service.js
```

Type:

- In-memory `Map`.

Scope:

- Key: `${brandId}:${customerId}`
- Last 10 messages.

Limitations:

- Resets on server restart.
- Not shared across Render instances.
- Not suitable for production.

## Analytics Logs

Path:

```text
backend/logs/chat-logs.json
```

Each log includes:

- `timestamp`
- `brandId`
- `customerId`
- `message`
- `detectedIntent`
- `escalated`
- `source`
- `reply`
- `knowledgeConfidence`
- `knowledgeCitations`

Do not commit real logs.

## Future Database Plan

Recommended Supabase/PostgreSQL tables:

- `brands`
- `brand_settings`
- `brand_policies`
- `brand_faqs`
- `users`
- `organizations`
- `organization_members`
- `documents`
- `document_chunks`
- `conversations`
- `messages`
- `orders`
- `products`
- `leads`
- `escalations`
- `analytics_events`
- `shopify_connections`

Recommended vector database:

- Qdrant for embeddings and metadata filtering.

Migration rule:
Keep service interfaces stable so `vectorStore.service.js` can be replaced without changing Support Brain.

