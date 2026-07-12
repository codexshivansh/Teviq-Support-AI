# Routing Precedence

Pure documentation. No behavior here should change as a result of this file
existing — it exists to make the *current* routing decision chain legible in
one place, since it is currently scattered across six layers with no single
source of truth for precedence (see `CODEBASE_GUIDE.md`'s flagged risk:
"Intent priority can cause wrong routing"). This is the reference for a
future "Unified Routing Layer" refactor (F9) — not a spec for one.

Every fact below is traced to the exact file/function responsible as of this
writing. If routing behavior changes, this file will drift and should be
updated alongside the code.

## Why this file exists

F7 (contextual order-page support) added a context-seeding rule to
`supportBrain.js` that interacted badly with F1's `collecting_order_id`
resume rule: a stale `pendingIntent` from an unrelated earlier turn silently
overrode a freshly-and-clearly-expressed intent, because the two rules had
no defined precedence relationship. That collision was found and fixed
during F7 testing (see `brain/supportBrain.js` around the
`collecting_order_id` resume block), but it is exactly the kind of bug this
architecture will keep producing as more features add their own special-case
branches — F1, F2, F4, and F7 have each done this. This document is the
first step toward making that precedence explicit instead of implicit.

## The six layers, in call order

```
POST /api/chat
   │
   ▼
[Layer 1] controllers/chat.controller.js — handleChat()
   │
   ▼
[Layer 2] brain/supportBrain.js — processMessage() (pre-routing)
   │
   ▼
[Layer 3] brain/toolRouter.js — routeTools()
   │
   ▼
[Layer 4] brain/supportBrain.js — processMessage() (post-routing state update)
   │
   ▼
[Layer 5] knowledge/retrieval.service.js — shouldBlockAIForLowConfidence()
   │
   ▼
[Layer 6] services/analytics.service.js — appendChatLog() (is_fallback)
```

---

### Layer 1 — `controllers/chat.controller.js` (`handleChat`)

Not a routing decision itself, but the entry point that assembles the inputs
every later layer depends on.

- Validates `brandId` (required, must match `/^[a-z0-9-]+$/`, must resolve to
  a real brand via `getBrandById`) and `message` (required, non-empty after
  trim). Either failing short-circuits with a 400/403 and never reaches
  `processMessage()`.
- Reads `req.body.context` (F7) and passes it through unchanged —
  `chat.controller.js` does no validation or interpretation of `context`
  itself; that happens entirely in Layer 2.
- Defaults `customerId` to `"guest"` if omitted. No validation on
  `customerId` — it is trusted as-is from the caller (widget or future
  channel adapter).

### Layer 2 — `brain/supportBrain.js`, `processMessage()`, pre-routing section

This is where most of the actual precedence conflicts live. In exact source
order:

1. **`analyzeConversation(message)`** — language/sentiment/messageType. Not a
   routing decision, but its `messageType === "complaint"` result can
   override intent in step 3.

2. **`detectIntent(message, brand.brandId)`** (`brain/intentEngine.js`) —
   first-match-wins over an ordered array of ~13 regex rules (`complaint` →
   `business_enquiry` → `human_support` → `refund_status` →
   `return_exchange` → `cancellation` → `order_tracking` →
   `shipping_policy` → `size_help` → `payment_cod` → `discount_query` →
   `product_recommendation` → `general_faq`). **Array order is priority
   order** — e.g. a message containing both "return" and "order" resolves to
   `return_exchange`, never `order_tracking`, because `return_exchange` is
   earlier in the array. If nothing matches, one bolt-on fallback runs (F4):
   if the message names a real product (title/handle/category/tags/keywords
   via `hasProductKeywordMatch`) **and** carries a parseable budget (via
   `parseBudget`), intent becomes `product_recommendation` even with no
   `recommend`/`suggest` keyword. Otherwise: `"unknown"`.

3. **Complaint override** — if `analysis.messageType === "complaint"` and
   intent is still `"unknown"`, intent becomes `"complaint"`. Only fires on
   `"unknown"` — never overrides a keyword-matched intent.

4. **`extractEntities(message)`** (`brain/entityExtractor.js`) — pulls
   `orderId`/`phone`/`email`/`name`/`productName`/`size`/`color`/`location`/
   `issue` out of the raw message text via independent regexes. Purely
   text-derived at this point — no state, no context.

5. **F7 context-seed** (`brain/supportBrain.js`, right after step 4) — if
   `context.orderId` was supplied on the request: `entities.orderId =
   entities.orderId || presetOrderId` (only fills the gap, never overrides
   an order ID the customer's own text already named), **and** if intent is
   still `"unknown"`, intent becomes `"order_tracking"`. This only fires when
   step 2 produced `"unknown"` — a message that already matched a keyword
   (e.g. `"return karna hai"`) keeps its own intent; only entity-seeding
   applies to it.

6. **Conversation-state resume** — reads `conversation_states` for
   `(brandId, customerId, channel)`, gated by `isConversationStateFresh`
   (updated within the last `CONVERSATION_STATE_STALE_MS` = 10 minutes).
   Five different states are handled, with different precedence behavior:

   - `checking_return`, `checking_cancellation`, `narrowing_products` — each
     is an **early return**: control passes entirely to a dedicated handler
     (`handleCheckingReturnState` / `handleCheckingCancellationState` /
     `handleNarrowingProductsState`) which **ignores the `intent`/`entities`
     computed in steps 2-5 entirely** and re-derives everything from
     `conversationState.context` and the pure decision functions in
     `returnFlow.service.js`/`cancellationFlow.service.js`. The only thing
     from earlier steps these handlers still care about is the raw
     `message` string and a **fresh hard-escalation check**
     (`detectEscalation`), which always wins even inside these states.

   - `collecting_order_id` — **not** an early return; instead conditionally
     overwrites `intent`:
     ```js
     if (
       conversationState.state === "collecting_order_id" &&
       isConversationStateFresh &&
       entities.orderId &&
       conversationState.context?.pendingIntent &&
       (intent === "unknown" || intent === conversationState.context.pendingIntent)
     ) {
       intent = conversationState.context.pendingIntent;
     }
     ```
     The `(intent === "unknown" || intent === pendingIntent)` guard is the
     F7-bug fix: this rule now only fires when the current message doesn't
     already express something more specific on its own (typically a bare
     order code, which `detectIntent` classifies as `"unknown"`). Before the
     fix, this unconditionally overwrote `intent`, which combined with F7's
     context-seed (step 5 making `entities.orderId` truthy on nearly every
     message) meant a stale `pendingIntent` could silently clobber a fresh,
     clearly-different intent.

   - `collecting_contact` — same non-early-return, intent-overwrite shape as
     `collecting_order_id`, minus the `entities.orderId` guard (a contact
     reply has no entity to check for):
     ```js
     if (
       conversationState.state === "collecting_contact" &&
       isConversationStateFresh &&
       conversationState.context?.pendingIntent &&
       (intent === "unknown" || intent === conversationState.context.pendingIntent)
     ) {
       intent = conversationState.context.pendingIntent;
     }
     ```
     Added because `LEAD_CAPTURE_INTENTS`
     (`human_support`/`complaint`/`business_enquiry`) previously never wrote
     *any* state — `buildLeadCaptureReply()` asks the customer for
     name+phone/email, but the next turn had no memory that this ask had
     just happened. A bare reply like "Shivansh - 9919036696" has no keyword
     for `intentEngine.js` to match, so it fell through to `"unknown"` and
     was misrouted into Layer 5's low-confidence fallback instead of back
     into the lead-capture branch that would have recognized it as the
     answer and confirmed the lead. See Layer 4 for the write side.

At the end of Layer 2's pre-routing section, exactly one `intent` value and
one `entities` object exist and are handed to Layer 3 — **unless** one of
the three early-return states fired, in which case Layers 3-6 as described
below never run at all for this request (the dedicated handler does its own
mini version of Layers 4 and 6 internally).

### Layer 3 — `brain/toolRouter.js` (`routeTools`)

Takes the `intent`/`entities` from Layer 2 and decides how the message gets
answered. Its own internal priority chain, first-match-wins by `if`
statement order in the source:

1. **Hard escalation** (`detectEscalation`) — always checked first,
   regardless of `intent`. If it fires, nothing else in this function runs;
   `allowAI = false`, `escalated = true`.
2. `LEAD_CAPTURE_INTENTS` (`human_support` / `complaint` / `business_enquiry`)
   → lead capture (`buildLeadCaptureReply`). `complaint` also sets
   `escalated = true`. Returns `leadState: { contact, hasContact }` — read by
   Layer 4 (below) to decide whether to start/clear `collecting_contact`.
3. `ORDER_INTENTS` (`order_tracking`, `return_exchange`, `refund_status`,
   `cancellation`) with `entities.orderId` present → order lookup via
   `getOrderById`. The lookup itself doesn't branch on intent — it always
   runs if the intent is order-related and an ID is present, before the
   intent-specific branches below use the result.
4. `order_tracking` → `buildOrderTrackingReply` (asks for ID / reports not
   found / reports status, in that priority).
5. `return_exchange` / `refund_status` / `cancellation` → `evaluatePolicy`
   (the policy engine decides eligibility; its reply becomes the response).
6. `product_recommendation` → its own 3-way sub-chain: keyword-matched reply
   → budget-filtered reply → (neither) a narrowing question
   (`needsProductNarrowing: true`, later read by Layer 4).
7. `discount_query` → hardcoded reply via `buildKnowledgeReply`.
8. **Fallback**: nothing above matched → `allowAI = true`,
   `fallbackReply = getIntentFallbackReply(brand, intent)` (only populated
   for `shipping_policy`/`payment_cod`/`size_help`; `null` otherwise). This
   is the only path that reaches Layer 5.

### Layer 4 — `brain/supportBrain.js`, post-routing state-transition block

After `routeTools()` returns, a **second, independent** `if`-chain (source
order = priority order) decides whether to write a new `conversation_states`
row:

1. `ORDER_INTENTS.includes(intent) && !entities.orderId && toolResult.allowAI === false`
   → `collecting_order_id` (remembers `pendingIntent` for the resume rule in
   Layer 2, step 6).
2. `intent === "return_exchange" && toolResult.order && toolResult.policyResult?.allowed`
   → `checking_return` (and **overwrites `toolResult.reply`** with
   `buildReturnReasonPrompt()`, superseding whatever `routeTools()`
   returned).
3. `intent === "cancellation" && toolResult.order && toolResult.policyResult?.allowed`
   → `checking_cancellation` (same reply-overwrite pattern via
   `buildCancellationReasonPrompt()`).
4. `intent === "product_recommendation" && toolResult.needsProductNarrowing`
   → `narrowing_products`.
5. `LEAD_CAPTURE_INTENTS.includes(intent) && toolResult.leadState` →
   `toolResult.leadState.hasContact ? "idle" : "collecting_contact"`, with
   `{ pendingIntent: intent }` as the context in the latter case (remembers
   which of the three lead-capture intents asked, for the resume rule in
   Layer 2, step 6). Mirrors rule 1's `collecting_order_id` shape.
6. `entities.orderId && toolResult.order` (any other case with a resolved
   order) → reset to `idle`.
7. None of the above → state is left untouched (this is deliberate for the
   "order ID given but not found" case, so a corrected ID on the next turn
   still resumes against the existing `collecting_order_id` state).

This block runs regardless of whether Layer 3 set `allowAI = true` — it can
still write state even for messages that are about to go to the AI.

### Layer 5 — `knowledge/retrieval.service.js` (`shouldBlockAIForLowConfidence`)

Only reached when `toolResult.allowAI === true` (i.e. Layer 3's fallback
case). A **separate, independently-maintained intent allowlist** —
`["unknown", "product_recommendation", "size_help", "payment_cod",
"shipping_policy"]` — determines whether a low-confidence knowledge-retrieval
result should block the AI from answering (replaced by
`buildLowConfidenceReply`/`toolResult.fallbackReply`) versus letting Gemini
generate a reply anyway. `general_faq` and any other intent not on this list
always reaches the AI regardless of retrieval confidence — a known,
accepted gap (AI hallucination risk for those intents is bounded instead by
`responseValidator.js`, not by this gate).

Note: `product_recommendation` is listed here but can never actually reach
this gate — Layer 3 always returns a reply or a narrowing question for that
intent and never sets `allowAI = true` for it. This is dead-but-harmless
entry in the allowlist, a small symptom of the same "no single source of
truth" problem this document is about.

### Layer 6 — `services/analytics.service.js` (`appendChatLog`, `is_fallback`)

Not a routing decision — but a **seventh place** that needs to independently
know "how did this message actually get routed," because F5's analytics
needed a write-time signal distinguishing a genuinely-useful reply from a
fallback. `is_fallback` is computed at each of the 7 `appendChatLog()` call
sites in `supportBrain.js`, using different logic per site:

- Main flow: `isFallback = true` only when Layer 5's low-confidence block
  fired.
- `checking_return` / `checking_cancellation` handlers:
  `isFallback = (flowResult.action === "ambiguous")` — i.e. the bot didn't
  understand the customer's confirm/decline reply.
- `narrowing_products` handler: `isFallback = !recommendationReply` — i.e.
  still no match after combining the original query with the follow-up.
- All three hard-escalation branches: `isFallback = false` unconditionally
  (escalation is a successful, deliberate routing outcome, not a failure to
  understand).

This is a second, independent encoding of "was this routing outcome good or
bad" that has to stay in sync with Layers 2-4 by hand at every call site —
another concrete argument for consolidating routing decisions rather than
letting each new feature re-derive its own notion of success/failure.

## Summary table

| # | Layer | File | Decides |
|---|---|---|---|
| 1 | Entry validation | `controllers/chat.controller.js` | brandId/message validity, passes `context` through untouched |
| 2 | Intent + entity + context + state resume | `brain/supportBrain.js` (pre-routing) + `brain/intentEngine.js` + `brain/entityExtractor.js` | Final `intent`/`entities` for this turn, or an early return into a state-specific handler |
| 3 | Tool dispatch | `brain/toolRouter.js` | Whether this is answered by a tool/policy/lead-capture, or handed to AI |
| 4 | State write | `brain/supportBrain.js` (post-routing) | Which `conversation_states` row (if any) gets written for the next turn |
| 5 | AI confidence gate | `knowledge/retrieval.service.js` | Whether a low-confidence retrieval blocks the AI for specific intents |
| 6 | Fallback signal | `services/analytics.service.js` | The `is_fallback` value logged for this turn, independently re-derived per call site |

## Known interactions/risks (as of this writing)

- **Fixed**: `collecting_order_id` resume (Layer 2, step 6) vs. fresh
  intent detection (Layer 2, step 2) — resolved by the `unknown`-or-matching
  guard described above.
- **Open, accepted**: `product_recommendation` in Layer 5's allowlist is
  unreachable dead code (see Layer 5 section).
- **Open, accepted**: `general_faq` (and any intent not in Layer 5's
  allowlist) has no confidence gate at all — relies entirely on
  `responseValidator.js` downstream.
- **Open, unquantified**: `is_fallback` (Layer 6) is hand-maintained
  separately at 7 call sites with 4 different derivation rules; a future
  change to Layer 2-4 precedence could silently make one of these derivations
  wrong without any test catching it, since nothing ties them back to a
  single source of truth.
