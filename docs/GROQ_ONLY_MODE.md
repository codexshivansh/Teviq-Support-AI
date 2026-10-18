# Groq-only replies and offline knowledge retrieval

## Reason and rollout state

The owner declined enabling paid Gemini billing. Customer prompts, sales
prompts and retrieval queries must therefore not be sent to Gemini's unpaid
API. The replacement is Groq-only text generation plus local lexical retrieval.
The backend change was deployed on 18 October 2026. A minimal synthetic
production chat in the isolated Teviq Meta Review workspace returned
`source: groq`; no customer conversation was used. This does not establish Meta
Advanced Access approval or complete regulatory compliance.

## Data paths

- `generateSupportReply`, D2C sales objections and B2B objections call Groq only.
- The deprecated `callGemini` entry throws before any network access, even if
  an old Gemini key remains in the environment. There is no automatic Gemini
  fallback. No Google billing or payment setting was changed.
- Groq errors/quotas use existing grounded local/system fallbacks or escalation.
  Provider error payloads are not printed with customer text.
- Conversation continuity remains Teviq-owned. Supabase keeps the transcript,
  and a cold session hydrates the latest five completed customer/assistant
  turns for the same brand and customer before the next Groq request. Groq
  does not need to retain prompts for a later reply to see that recent context.
- Knowledge query matching fetches only the requested brand's stored text and
  metadata from Supabase. It does not request embeddings or call the old vector
  RPC. Pagination scans up to 10,000 chunks, then fails closed rather than
  silently claiming to search a partial corpus. This is a small-corpus approach;
  large deployments need database-side full-text search and separate evaluation.
- New document/FAQ/policy indexing computes deterministic local feature hashes.
  The 768-dimensional vectors only preserve the existing NOT NULL schema. They
  are marked `local-feature-hash-v1` / `lexical` in chunk metadata. They are NOT
  semantic replacements for Gemini vectors. No re-embedding or old-row cleanup
  is required or performed. Existing vectors and chats are unchanged.
- The legacy semantic-search method and Gemini backfill command fail closed,
  preventing accidental comparisons of incompatible old/new vectors.

## Relevance and limits

Local matching uses Unicode words, basic stopwords, weighted term coverage and
exact FAQ-question matches. Confidence numbers are lexical heuristics, not
semantic similarity probabilities. Weak single-word/partial matches do not
receive the old broad FAQ confidence bypass. Hindi/Hinglish paraphrases without
shared words can miss relevant knowledge. Groq itself remains rate limited.

Read-only synthetic queries against Teviq's live knowledge returned strong
matches for the exact setup-time FAQ and Instagram/WhatsApp support keywords,
and no matches for an unrelated query. General services, single-word pricing
and a broad data/privacy/deletion query were low confidence. Do not claim equal
quality to semantic retrieval; improve/evaluate the corpus and matching before
promising full coverage. No customer message text was read or sent to an AI in
these checks; only counts/scores were printed.

## Verification and outstanding operations

- `npm run test:groq-only`: mocks all external calls and fails for non-Groq/
  non-Supabase hosts; covers reply paths, 429 fallback, deprecated Gemini guard,
  offline query/document/batch features, upload row format, Unicode matching,
  pagination and cross-brand fail-closed behavior.
- Brain, response-integrity, knowledge-storage, reply-window and Instagram
  manual-reply regression suites passed during implementation.
- Offline embedding, Instagram parser/signature, OAuth, refresh and customer
  profile suites also passed. Production-hardening initially could not start
  its localhost server inside the sandbox; rerunning with local-server
  permission passed sanitized errors, inactive-brand protection and CORS.
- Groq console is signed in to Personal / Default Project. Billing > Plans shows
  Free, $0, Current Plan. With the owner's explicit approval, Inference APIs ZDR
  was enabled on 18 October 2026 and remained enabled on a fresh console state.
  Global ZDR stayed disabled; Batch and Fine-tuning/LoRA stayed on. No billing,
  upgrade, or other data-control setting changed. The production Groq key
  accepted a synthetic request. ZDR was enabled in the Personal / Default
  Project organization; the key's organization was not independently matched,
  so confirm that association before making a compliance claim about the live
  key.
- A production synthetic chat returned `source: groq`. This confirms the tested
  route used Groq, not a real Instagram customer flow.
- Update Meta's provider disclosures to reflect the deployed path: Render,
  Supabase and Groq process or store service data; Google/Gemini is no longer
  called by the backend. Verify all processing and remote-access countries
  before saving provider entries.
- Reviewer workspace, recording, data-handling answers and review submission
  remain separate tasks. No review was submitted by this code change.

Sources: [Groq data controls](https://console.groq.com/docs/your-data),
[Groq rate limits](https://console.groq.com/docs/rate-limits),
[Gemini data-use terms](https://ai.google.dev/gemini-api/terms).
