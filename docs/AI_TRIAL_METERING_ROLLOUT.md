# AI trial metering rollout

This feature is **off by default**. Merely deploying this code does not
activate a trial, set a Groq paid plan, change a knowledge policy, or call AI.

1. Review and apply `supabase/migrations/0027_add_ai_trial_usage.sql` in the
   Teviq Supabase project. This is additive and creates no active trial.
2. Deploy the backend and dashboard together.
3. Set `AI_TRIAL_METERING_ENABLED=true` on the backend only after the SQL
   migration is confirmed. Set `AI_TRIAL_GLOBAL_TOKENS_PER_DAY=100000` for the
   initial shared budget. Restart/deploy the backend.
4. In Analytics, select one brand at a time. A Teviq admin can enter trial
   start/end times and per-day call/token limits, then activate that brand.
   Keep every brand disabled until explicitly approved.
5. Run a small live test and compare Groq Console usage to the dashboard.
   Price estimates use the published `openai/gpt-oss-20b` rate only; the Groq
   invoice is authoritative.

Limits are counted on **India-time calendar days** and apply to Groq API calls across website,
WhatsApp and Instagram. A retry is another call. The token ceiling is reserved
before each call using a conservative UTF-8 byte bound and later replaced with
the provider's reported token usage. This can reject a long prompt before the
actual daily token total reaches the configured maximum. Ambiguous provider
failures keep their reservation instead of undercounting possible usage.

The SQL function serializes reservations to prevent concurrent requests from
exceeding the configured daily caps. Calls that never reach Groq (local rules,
cached/extractive answers, etc.) do not consume AI-call quota. Token usage is
not inferred from visible customer messages.

The backend service-role key is required for the RPCs. Tables have RLS enabled;
end users cannot write usage rows. The trial update endpoint additionally
requires Clerk's `teviq_admin` role. No API credential is shown in the UI.

If metering is enabled before the migration, Groq calls fail closed to the
existing local fallback. Roll back by setting `AI_TRIAL_METERING_ENABLED=false`.
Do not change Refund Policy or FAQ trial promises until the approved offer is
known and these caps have been verified live.
