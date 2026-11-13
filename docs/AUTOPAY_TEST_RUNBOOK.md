# Trial and autopay test release

## Scope and actual status
Local implementation, not a live billing release. Existing production customers keep their existing agreements. Test-mode checkout replaces new one-time orders; old order verification remains available. Internal Teviq workspace cannot subscribe.

## Account prerequisites
Use a separate test database/backend. Apply migrations 0038, 0039, 0040 after the existing migrations. Configure BILLING_TEST_ENABLED=true and AI_TRIAL_METERING_ENABLED=true, with non-production NODE_ENV. Set RAZORPAY_KEY_ID (rzp_test only), RAZORPAY_KEY_SECRET, RAZORPAY_WEBHOOK_SECRET securely. Never put secret values in frontend variables.

Create monthly, quantity-one test plans and set RAZORPAY_TEST_PLAN_IDS as a JSON mapping:
- starter-test-v1 -> corresponding provider plan ID (INR 999)
- standard-test-v1 -> corresponding provider plan ID (INR 2499)
- growth-test-v1 -> corresponding provider plan ID (INR 3199)
The backend verifies provider plan amount/currency/frequency before checkout. Prices and daily caps remain test fixtures, not approved live commercial terms. Test mandate has 12 monthly cycles, disclosed in checkout. Decide live mandate length, tax treatment and final caps before enabling a live implementation.

Frontend test build: use `vite build --mode billing-test`; ordinary production builds hard-disable billing UI. Set VITE_BILLING_TEST_ENABLED=true on website and dashboard; VITE_DASHBOARD_URL points at test dashboard; dashboard VITE_API_BASE_URL points at test backend. The /billing route follows authenticated onboarding. Customer authorizes through Razorpay; no payment credentials are stored by Teviq.

## Timing
Trial starts when the server records the customer's start-trial request, before authorization checkout, and ends exactly 72 hours later. First charge is scheduled for that fixed end timestamp. This deliberately supersedes the earlier draft claiming 72 hours after mandate authorization: UPI subscription start-date updates are not generally supported. The UI discloses the fixed timestamp. Authorization must complete before the configured mandate expiry (one hour before the first charge). Provider processing delay is not a guarantee of a precise debit time.

## Events and recovery
Configure signed subscription events at /api/billing-webhook. The receiver refetches the provider subscription and paid invoices; webhook data alone never grants paid access. Include subscription authentication, activation, charged, pending, halted, cancelled and completed events. Provider customer_notify is enabled; actual notification delivery and pre-debit notice must be verified in the merchant account.

Configure the optional billing-test-reconcile GitHub workflow with BILLING_TEST_RECONCILIATION_ENABLED=true, BILLING_TEST_BASE_URL and BILLING_TEST_INTERNAL_CRON_SECRET only for the isolated test deployment. It retries verification and cancellation. Uncertain subscription creation is recovered using the unique local ID in provider notes; it is never blindly recreated. Recovery scans at most 1000 subscriptions; larger accounts need a cursor-based operator recovery tool before scale. Customer status stays pending on unresolved errors.

## Cancellation and refunds
Trial cancellation requests immediate provider cancellation and retains the trial's original end. Paid cancellation stops further billing while retaining paid access. A local request alone is not shown as confirmed. Cancellation intent persists across provider outages and is retried. A captured charge after a pre-trial-end cancellation request, or a refunded subscription payment, flags review and blocks subscribed-channel use. Automatic refunds are deliberately not issued; support must resolve provider-confirmed money movements. Pending cancellation at the deadline requires attention and cannot be promised charge-free without provider confirmation.

## Required provider acceptance before launch
Verify real test-mode authorization, exact 72-hour schedule, authorization fee disclosure, notification delivery, cancellation before first debit, cancellation during provider outage, cancellation/debit race, first captured recurring invoice, renewal, failed debit, refund, out-of-order webhook and browser-close recovery. Verify provider invoice billing_start/billing_end fields; missing fields fail closed. Test real account login/onboarding and workspace setup against isolated services. No production credentials were used in local tests.

## Local checks
npm run test:billing covers signature validation, captured payment matching, role gates, migration replay, channel entitlement, 72-hour dates, cancellation persistence/retry, payment idempotency and workspace ownership. Dashboard npm test and build, website build, existing AI-access SQL, channel-send-window and production-hardening checks passed. Browser UI was exercised with a clearly labelled mocked gateway fixture: consent required, trial status/date shown, confirm cancellation, cancelled state with access expiry retained. This is not evidence of a real Razorpay mandate.

## Rollout conditions
Live-key support remains intentionally disabled. Do not change that until provider acceptance above passes, refund/support policy and plan limits are finalized, and the entire source/knowledge copy is published together. No production migration, push or deployment was performed for this work.
