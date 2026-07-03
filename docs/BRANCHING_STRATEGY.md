# Branching Strategy

## Recommended Branches

Use a simple startup-friendly Git flow:

- `main`: production-ready branch.
- `develop` optional: staging integration branch if team grows.
- `feature/<short-name>`: new work.
- `fix/<short-name>`: bug fixes.
- `docs/<short-name>`: documentation-only changes.
- `hotfix/<short-name>`: urgent production fixes.

Examples:

```text
feature/knowledge-document-tags
fix/dashboard-auth-token
docs/sooryansh-handover
hotfix/widget-mobile-keyboard
```

## Current Repo Note

The local project appears to have fragmented Git history:

- `teviq-support-ai` root has an older/unrelated-looking history.
- `backend` has its own `.git`.
- `widget` has its own `.git`.
- `/Users/shivanshgupta/Documents/teviq site` has a separate website history.

Before Sooryansh takes ownership, decide the canonical GitHub structure:

1. Monorepo containing backend/dashboard/widget/docs, plus website as separate repo.
2. Full monorepo containing backend/dashboard/widget/website/docs.
3. Separate repos per surface.

Document the final choice in this file.

## Pull Request Rules

Every PR should include:

- Summary.
- Surface touched.
- Screenshots for UI changes.
- Test commands.
- Manual QA checklist.
- Deployment impact.
- Rollback plan for backend/widget changes.

## Protected Branch Rules

Recommended for `main`:

- Require PR review.
- Require status checks.
- Block force pushes.
- Require branch up to date before merge.
- Restrict direct pushes after team expands.

## Commit Message Style

Use clear messages:

```text
fix: attach Clerk JWT to protected dashboard requests
feat: add Knowledge Brain document upload
docs: add deployment handover package
chore: ignore local chat logs
```

## Release Branches

For larger releases:

```text
release/2026-07-dashboard-auth
```

Only bug fixes and docs should go into a release branch.

