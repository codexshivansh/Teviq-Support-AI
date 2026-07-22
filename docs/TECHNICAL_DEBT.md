# Technical Debt

## Critical

### No Persistent Multi-Tenant Authorization

Protected dashboard endpoints verify Clerk authentication but do not yet map users to allowed brands/organizations. Any authenticated user could request another configured `brandId`.

Fix:

- Add database-backed organizations.
- Map Clerk user IDs to brand permissions.
- Enforce brand authorization middleware before controllers.

### Local Filesystem Storage Is Not Production-Safe

Knowledge uploads, vector store, chat logs, and demo data are local filesystem based. Render instances are ephemeral and may not preserve or share runtime writes.

Fix:

- Move documents to object storage.
- Move metadata/logs to Supabase/PostgreSQL.
- Move vectors to Qdrant or Supabase pgvector.

### Widget Releases Are Unversioned

Clients load `widget.js` directly. A bad deploy affects all embedded clients immediately.

Fix:

- Introduce versioned widget URLs.
- Keep stable alias for controlled rollout.
- Add smoke tests before promotion.

## High

### Dashboard API Base URL Is Hardcoded

`dashboard/src/services/api.js` hardcodes:

```text
https://teviq-support-ai-backend.onrender.com
```

Fix:

- Use `VITE_API_BASE_URL`.
- Keep production/staging/local separated.

### Support Memory Is In-Memory Only

Conversation memory resets on backend restart and is not shared across instances.

Fix:

- Persist conversation sessions in database.
- Add state machine for follow-up messages.

### Local Hash Embeddings Are MVP-Only

Current embeddings are deterministic hash vectors, not semantic embeddings from a model. This is useful for local demo but weaker than true semantic retrieval.

Fix:

- Add provider interface for embeddings.
- Use production embedding model.
- Store vectors in vector database.

### No Automated Test Runner

Tests are Node scripts, not a unified test framework.

Fix:

- Add Vitest/Jest for unit tests.
- Add Playwright for widget/dashboard smoke tests.
- Add CI checks.

### CORS Dev Behavior Does Not Match Older Docs

Older docs mention development allows all origins, but current CORS implementation uses the same whitelist/pattern behavior. Localhost is included by default, but arbitrary dev origins may be blocked.

Fix:

- Decide intended dev CORS behavior.
- Update code or docs consistently.

## Medium

### Duplicate/Generated Files in Tree

Resolved: obsolete numeric-suffix copies and tracked build output were removed. Local backups, logs, build output, environment files, and `.DS_Store` files are ignored.

### `intent.service.js` Appears Legacy

Support Brain uses `brain/intentEngine.js`. `services/intent.service.js` remains and may confuse maintainers.

Fix:

- Confirm no imports.
- Remove or mark deprecated.

### Widget CSS Has Minor Duplication

Observed duplicate style declarations and a complex single-file CSS block.

Fix:

- Keep frameworkless output, but consider generating widget CSS from a source file.
- Add visual regression checks.

### Analytics Are Demo-Only

Dashboard analytics are static demo data. Backend logs exist but are not exposed as analytics APIs.

Fix:

- Store analytics events in database.
- Build real dashboard queries.

## Low

### Root Git History Is Fragmented

Local histories are split across root, backend, widget, and website.

Fix:

- Decide canonical GitHub structure.
- Clean repo boundaries before onboarding more engineers.

### Dashboard Routing Is Custom

`src/App.jsx` manually maps paths to pages. It works for demo scale but may become fragile.

Fix:

- Move to React Router if dashboard grows.

### Settings Page Is Local State Only

Settings edits are not persisted.

Fix:

- Add backend settings API after database exists.

## Prioritized Next Cleanup PRs

1. Add `VITE_API_BASE_URL` for dashboard.
2. Add brand authorization model design.
3. Clean duplicate/generated files.
4. Add CI with backend scripts + dashboard/website builds.
5. Add widget smoke tests.
