# API Documentation

Base URL examples:

```text
Local:      http://localhost:5000
Production: https://teviq-support-ai-backend.onrender.com
```

## Authentication Rules

Public:

- `GET /health`
- `GET /api/brand-config/:brandId`
- `POST /api/chat`

Protected by Clerk JWT:

- `/api/knowledge/*`
- `/api/integrations/shopify/*`

Protected requests require:

```http
Authorization: Bearer <CLERK_JWT>
Content-Type: application/json
```

Knowledge upload uses `multipart/form-data`.

## `GET /health`

Authentication:
None.

Response:

```json
{
  "ok": true,
  "service": "teviq-support-ai-backend",
  "environment": "production"
}
```

## `GET /api/brand-config/:brandId`

Authentication:
None.

Purpose:
Return public widget config only.

Example:

```bash
curl https://teviq-support-ai-backend.onrender.com/api/brand-config/urban-demo
```

Response:

```json
{
  "brandName": "Urban Gadgets Demo",
  "widgetTitle": "Urban Gadgets Help",
  "welcomeMessage": "Welcome to Urban Gadgets support...",
  "themeColor": "#0f766e",
  "position": "bottom-right",
  "quickReplies": ["Track my order", "Warranty help", "Product compatibility", "Talk to human"]
}
```

Errors:

- `404 brand_not_found`

## `POST /api/chat`

Authentication:
None.

Rate limit:
60 requests per minute per IP.

Headers:

```http
Content-Type: application/json
```

Body:

```json
{
  "brandId": "vastra-demo",
  "message": "Where is my order?",
  "customerId": "guest_123"
}
```

Response:

```json
{
  "reply": "Please share your order ID so I can check the latest status for you.",
  "source": "system",
  "escalated": false,
  "intent": "order_tracking",
  "language": "english",
  "sentiment": "neutral",
  "warnings": []
}
```

Possible `source` values:

- `system`
- `gemini`
- `groq`

Possible `intent` values:

- `order_tracking`
- `return_exchange`
- `refund_status`
- `cancellation`
- `shipping_policy`
- `size_help`
- `payment_cod`
- `product_recommendation`
- `discount_query`
- `human_support`
- `complaint`
- `business_enquiry`
- `general_faq`
- `unknown`

Error examples:

Missing brand:

```json
{
  "reply": "brandId is required.",
  "source": "system",
  "escalated": false,
  "intent": "unknown",
  "language": "english",
  "sentiment": "neutral",
  "warnings": ["missing_brand_id"]
}
```

Missing message:

```json
{
  "reply": "Please type a message so I can help you.",
  "source": "system",
  "escalated": false,
  "intent": "unknown",
  "language": "english",
  "sentiment": "neutral",
  "warnings": ["missing_message"]
}
```

Rate limited:

```json
{
  "reply": "Too many messages. Please wait a minute and try again.",
  "source": "system",
  "escalated": false,
  "intent": "general_faq"
}
```

## `GET /api/knowledge/:brandId/documents`

Authentication:
Required.

Purpose:
List uploaded knowledge documents and stats for one brand.

Example:

```bash
curl "$API/api/knowledge/urban-demo/documents" \
  -H "Authorization: Bearer <CLERK_JWT>"
```

Response:

```json
{
  "brandId": "urban-demo",
  "documents": [
    {
      "brandId": "urban-demo",
      "documentId": "doc_123",
      "title": "Warranty Policy",
      "sourceName": "warranty.pdf",
      "storedFileName": "doc_123.pdf",
      "mimeType": "application/pdf",
      "extension": "pdf",
      "sizeBytes": 12345,
      "uploadedAt": "2026-07-04T00:00:00.000Z",
      "chunkCount": 5
    }
  ],
  "stats": {
    "brandId": "urban-demo",
    "documentCount": 1,
    "chunkCount": 5
  }
}
```

Errors:

- `401 unauthorized`
- `401 invalid_token`
- `404 brand_not_found`

## `POST /api/knowledge/:brandId/upload`

Authentication:
Required.

Content type:
`multipart/form-data`

Fields:

- `document`: required file; PDF, DOCX, or TXT.
- `title`: optional.

Limits:

- Max file size: 10MB.
- One file per request.

Example:

```bash
curl -X POST "$API/api/knowledge/urban-demo/upload" \
  -H "Authorization: Bearer <CLERK_JWT>" \
  -F "document=@policy.pdf" \
  -F "title=Return Policy"
```

Response:

```json
{
  "ok": true,
  "brandId": "urban-demo",
  "document": {
    "documentId": "doc_123",
    "title": "Return Policy",
    "chunkCount": 4
  },
  "chunkCount": 4
}
```

Errors:

- `400 missing_document`
- `400 file_too_large`
- `400 Unsupported document type`
- `400 No readable text was found in this document`
- `401 unauthorized`
- `404 brand_not_found`

## `DELETE /api/knowledge/:brandId/documents/:documentId`

Authentication:
Required.

Example:

```bash
curl -X DELETE "$API/api/knowledge/urban-demo/documents/doc_123" \
  -H "Authorization: Bearer <CLERK_JWT>"
```

Response:

```json
{
  "ok": true,
  "brandId": "urban-demo",
  "documentId": "doc_123",
  "deletedChunks": 4
}
```

Errors:

- `401 unauthorized`
- `404 brand_not_found`
- `404 document_not_found`

## `POST /api/knowledge/:brandId/retrieve`

Authentication:
Required.

Purpose:
Debug retrieval. Returns internal citations and matching chunks.

Body:

```json
{
  "query": "Do earbuds have warranty?",
  "topK": 5
}
```

Response:

```json
{
  "brandId": "urban-demo",
  "query": "Do earbuds have warranty?",
  "confidence": 0.3123,
  "confidenceLabel": "medium",
  "lowConfidence": false,
  "citations": [
    {
      "chunkId": "doc_123_chunk_1",
      "documentId": "doc_123",
      "sourceName": "warranty.pdf",
      "sectionTitle": "Warranty Policy",
      "score": 0.3123
    }
  ],
  "matches": []
}
```

## `GET /api/integrations/shopify/:brandId/status`

Authentication:
Required.

Response:

```json
{
  "provider": "shopify-demo",
  "brandId": "urban-demo",
  "connected": true,
  "productCount": 3,
  "orderCount": 3,
  "categories": ["earbuds", "power bank", "accessories"],
  "lastSyncedAt": "2026-07-04T00:00:00.000Z",
  "mode": "demo",
  "status": "connected",
  "message": "Demo Shopify connector is ready for this brand."
}
```

## `POST /api/integrations/shopify/:brandId/sync`

Authentication:
Required.

Response:

```json
{
  "ok": true,
  "provider": "shopify-demo",
  "brandId": "urban-demo",
  "syncedAt": "2026-07-04T00:00:00.000Z",
  "imported": {
    "products": 3,
    "orders": 3
  },
  "mode": "demo",
  "message": "Demo sync completed from local Shopify-style JSON data."
}
```

## `GET /api/integrations/shopify/:brandId/products`

Authentication:
Required.

Response:

```json
{
  "brandId": "urban-demo",
  "provider": "shopify-demo",
  "products": [
    {
      "id": "gid://shopify/Product/urban-001",
      "handle": "swiftbuds-pro",
      "title": "SwiftBuds Pro",
      "category": "earbuds",
      "price": 2999,
      "currency": "INR",
      "available": true
    }
  ]
}
```

