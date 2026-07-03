# System Flow

## Widget Load Flow

```text
Customer opens client storefront
  -> Browser loads widget.js
  -> widget.js reads data-brand-id and data-api-url
  -> widget.js fetches /api/brand-config/:brandId
  -> If config succeeds, use public brand config
  -> If config fails, use fallback widget config
  -> Render floating button
  -> Render welcome card and default quick replies
```

Public brand config includes only:

- `brandName`
- `widgetTitle`
- `welcomeMessage`
- `themeColor`
- `position`
- `quickReplies`

Private brand fields such as policies, FAQs, manager contact, and escalation rules are not exposed by this endpoint.

## Chat Request Flow

```text
Customer submits message
  -> Widget sends POST /api/chat
  -> Chat controller validates brandId and message
  -> supportBrain.processMessage()
  -> Load brand
  -> Analyze language/sentiment/message type
  -> Detect intent
  -> Extract entities
  -> Store user message in memory
  -> Route tools
  -> Retrieve knowledge if AI is allowed
  -> Build context
  -> Generate system or AI reply
  -> Validate response
  -> Store assistant reply in memory
  -> Append analytics log
  -> Return JSON to widget
  -> Widget renders card or plain text fallback
```

Request body:

```json
{
  "brandId": "urban-demo",
  "message": "Track order UG-SH-7001",
  "customerId": "guest_123"
}
```

Response body:

```json
{
  "reply": "Order UG-SH-7001 is currently Out for Delivery...",
  "source": "system",
  "escalated": false,
  "intent": "order_tracking",
  "language": "english",
  "sentiment": "neutral",
  "warnings": []
}
```

## Branch: Invalid Brand

```text
supportBrain loads brand
  -> brand.service validates safe brandId and required fields
  -> Brand missing or invalid
  -> Return 404 response
```

The widget should show the returned system response or error fallback.

## Branch: Hard Escalation

Examples:

- fraud
- scam
- legal
- police
- abuse
- brand-specific hard keywords

Flow:

```text
Message enters Support Brain
  -> toolRouter calls detectEscalation()
  -> Hard escalation detected
  -> AI is not called
  -> buildEscalationReply() returns manager contact
  -> responseValidator ensures manager contact is included
  -> Analytics logs escalated=true
```

This branch bypasses Gemini/Groq by design.

## Branch: Human Support / Complaint / Business Enquiry

Flow:

```text
Intent is human_support, complaint, or business_enquiry
  -> AI is not called
  -> lead.service checks whether phone/email exists
  -> If contact is missing, ask for name and phone/email
  -> If contact exists, acknowledge and say team will contact soon
  -> complaint is marked escalated=true
```

## Branch: Order Tracking

Flow:

```text
Intent is order_tracking
  -> entityExtractor looks for orderId
  -> If no orderId, ask for order ID
  -> If orderId exists, order.service searches Shopify demo provider first
  -> If not found, search local orders.json
  -> Always filter by brandId
  -> Return status only if order belongs to the current brand/customer scope
```

Cross-brand leakage is blocked by filtering on `brandId`.

## Branch: Return / Exchange

Rules:

- Return/exchange can only be checked when order status is `Delivered`.
- If no order ID is present, ask for order ID.
- If order is not delivered, explain it can be checked after delivery.

Flow:

```text
Intent is return_exchange
  -> Load order if orderId exists
  -> policy.service.evaluateReturnExchange()
  -> Return system reply
  -> AI is not called
```

## Branch: Refund Status

Rules:

- Do not promise refunds.
- Refund guidance depends on order delivery, return approval, and brand policy.
- No dates or confirmations should be invented.

Flow:

```text
Intent is refund_status
  -> Load order if possible
  -> policy.service.evaluateRefund()
  -> Return guidance-only system reply
```

## Branch: Cancellation

Rules:

- Cancellation is allowed only while order status is `Processing`.
- Final confirmation must come from support team.

Flow:

```text
Intent is cancellation
  -> Load order if possible
  -> policy.service.evaluateCancellation()
  -> Return allowed/denied system reply
```

## Branch: Product Recommendation

Flow:

```text
Intent is product_recommendation
  -> product.service loads Shopify demo products for brandId
  -> Score products by keyword overlap
  -> If products match, return system recommendation
  -> If not, AI may answer using brand FAQs/policies/knowledge
```

## Branch: FAQ / General AI

Flow:

```text
Intent allows AI
  -> retrieveKnowledge({ brandId, query, topK: 5 })
  -> If confidence is low for unknown/product recommendation, block hallucination
  -> Otherwise build Gemini prompt
  -> Gemini success: source=gemini
  -> Gemini failure: Groq fallback
  -> Groq failure: extractive/system fallback
  -> responseValidator repairs unsafe output
```

## Dashboard Protected API Flow

```text
Brand owner opens dashboard
  -> Clerk loads session
  -> Dashboard AuthContext obtains JWT via getToken()
  -> API client attaches Authorization: Bearer <jwt>
  -> Backend requireClerkAuth verifies token with CLERK_SECRET_KEY
  -> Protected route executes
```

Protected route groups:

- `/api/knowledge/*`
- `/api/integrations/shopify/*`

Public route groups:

- `/health`
- `/api/brand-config/*`
- `/api/chat`

