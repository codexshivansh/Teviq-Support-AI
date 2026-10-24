# AI trial tracking setup — change log

## Implemented locally

- Added database migration `0027_add_ai_trial_usage.sql` for per-brand trial limits, daily usage events, and atomic reservation/accounting functions. It creates no active trials.
- Added backend usage metering and cap checks around the shared Groq caller. Retries count as separate AI calls; usage is grouped by India-time day.
- Added authenticated usage-summary and Teviq-admin-only trial-settings routes. Demo sessions are denied usage access.
- Added an Analytics dashboard panel for per-brand usage and trial settings. The admin form has Save and Discard; opening or editing it does not call the AI provider.
- Kept the feature disabled by default. No policy or billing configuration was changed.

## Verification completed

- Backend AI-usage, Groq-only, and support-brain tests passed.
- Dashboard production build passed.
- Demo-session access check passed.
- Confirmed the Teviq Supabase production project matches the local backend configuration.
- Preflight check showed neither new usage table existed.
- Applied the additive migration in the Teviq Supabase SQL editor. The editor reported success.
- Read-only verification confirmed both tables exist, row-level security is enabled, zero client trials are configured, and only the backend service role can execute the reservation function.
- A second read-only check confirmed zero usage events and that only the backend service role can execute the usage-finalization function.

## Pending

- Deploy backend and dashboard together; do not enable metering or activate any client trial yet.
- Run a small live usage test after the separate enablement decision.
