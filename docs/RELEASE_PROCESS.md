# Release Process

## Release Philosophy

Teviq has four user-facing surfaces:

- Website.
- Widget.
- Dashboard.
- Backend.

The backend and widget are the highest-risk surfaces because they directly affect customer support flows. Release them deliberately.

## Release Types

### Patch Release

Examples:

- Copy fix.
- UI spacing fix.
- CORS origin addition.
- Demo data correction.

Required checks:

- Relevant local build/test.
- Manual smoke test of affected surface.

### Minor Release

Examples:

- New dashboard page.
- New support intent.
- New widget card.
- New Knowledge Brain behavior.

Required checks:

- Backend tests.
- Dashboard/website builds if touched.
- Widget demo verification.
- API compatibility review.

### Major Release

Examples:

- Real database.
- Real Shopify OAuth.
- Auth model changes.
- Widget API contract changes.
- Multi-tenant permissions.

Required checks:

- Migration plan.
- Rollback plan.
- Manual QA matrix.
- Security review.
- Founder demo approval.

## Release Checklist

1. Pull latest main branch.
2. Create feature branch.
3. Make scoped changes.
4. Run relevant tests.
5. Verify no secrets.
6. Verify no generated logs/uploads.
7. Update docs when behavior changes.
8. Open PR or ask founder for approval.
9. Deploy preview.
10. Smoke test preview.
11. Merge/deploy production.
12. Smoke test production.

## Required Checks by Surface

Backend:

```bash
npm run validate:brands
npm run test:brain
npm run test:knowledge
npm run test:shopify-demo
npm run smoke:test
```

Dashboard:

```bash
npm run build
```

Website:

```bash
npm run build
```

Widget:

- Open demo hub.
- Test all three demo storefronts.
- Test mobile width around 390px.
- Test order tracking, return/exchange, human support, manual message.

## Release Notes Format

Use this template:

```md
## Summary
- What changed.

## Surfaces Touched
- Backend / Dashboard / Widget / Website

## Tests
- Commands run.
- Manual flows verified.

## Risks
- Known edge cases.

## Rollback
- Previous deployment can be restored via Render/Vercel.
```

## No-Go Conditions

Do not release if:

- `/api/chat` is broken.
- Widget cannot load config.
- Dashboard protected APIs are public.
- Clerk login fails in production.
- Real secrets appear in code.
- Brand data leaks across brands.
- Widget breaks mobile close/input behavior.

