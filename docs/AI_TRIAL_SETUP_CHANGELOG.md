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
- Scoped backend and dashboard commits were pushed to their respective GitHub main branches. Unrelated local changes were not included.
- The live Render backend environment did not list `AI_TRIAL_METERING_ENABLED`; the feature therefore remains off by default in the deployed code.
- The backend production-hardening test passed when run with permission to bind its local test port.
- Public live verification: the backend health endpoint returned success, the new trial route required authentication, and a nonexistent route returned not found. This confirms the new route is deployed without exposing usage data.
- Public live dashboard assets contain the AI trial panel, the inactive-metering notice, and Save trial settings control.
- Live authenticated dashboard verification in a fresh Brave tab showed the AI trial usage panel, the inactive-metering notice, a disabled Save control, and Discard changes.
- Follow-up UI audit found the inactive trial form used browser-native grey fields and pushed support metrics below the fold. The dashboard panel was changed to a compact status card; its settings form now opens only when metering is enabled and a Teviq admin chooses Configure trial. Dark-mode field styles were aligned with the existing dashboard. Dashboard build passed, and the production bundle was verified to contain the new `Setup pending` and `Configure trial` UI. The old oversized inactive form is no longer served.
- Added the missing standard section spacing between the AI trial usage card and the five support-performance metric cards. The dashboard production build passed after this spacing fix.
- On 2 November, re-verified the production Render backend: two health checks returned HTTP 200 in under half a second, and a live brand-config request returned HTTP 200 while reading production data.
- Re-verified the production Supabase project as Healthy. Service-role REST reads for `ai_trial_limits` and `ai_usage_events` returned HTTP 200; three completed Instagram usage events were present.
- Verified in the Supabase SQL editor that the service role already has explicit table privileges on both AI-usage tables. No live grant change was required, and no client-facing role was granted access.
- Added migration `0033_explicit_service_role_data_api_grants.sql` so migrations replayed after Supabase's public-schema grant change retain server-only Data API access for existing and future tables. An embedded PostgreSQL test confirmed both current-table and default future-table grants.
- Re-ran the AI trial unit test after the grant migration; reservation, accounting, dashboard summary, and pre-call limit behavior passed.

## Pending

- The Meta Review trial row is still marked enabled, but its three-day window ended on 28 October; the database therefore returns an inactive-trial result for that workspace until an admin explicitly changes the trial.
- Coordinate migration `0031_add_ai_access_modes.sql` with its matching backend release. Applying it alone would intentionally block AI provider calls for brands that do not yet have an access record.
- Apply migration `0033_explicit_service_role_data_api_grants.sql` with the next controlled database migration. Current production grants already pass, so no emergency live permission change is required.
