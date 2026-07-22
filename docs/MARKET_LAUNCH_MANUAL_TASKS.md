# Market Launch Manual Tasks

Code-side production hardening is automated where possible. These remaining items require access to Render, GitHub, Vercel, Clerk, Shopify or a real browser session.

## 1. Deploy the reviewed repositories

1. Review the local diffs in backend, dashboard, widget and website.
2. Commit and push each repository only after approval.
3. Confirm the latest deployment is healthy in Render and Vercel.

## 2. Activate 30-day chat retention

1. In Render, keep `CHAT_RETENTION_DAYS=30` or rely on the safe default of 30.
2. Confirm `INTERNAL_CRON_SECRET` is a long random value.
3. In the backend GitHub repository, add an Actions secret named `INTERNAL_CRON_SECRET` with the same value.
4. Run the **Chat Retention** workflow manually once.
5. Confirm the workflow succeeds and old `chat_logs` rows are removed without affecting recent conversations.

## 3. Verify website and widget deployment

1. Deploy the website repository after its `vercel.json` is merged.
2. Open these URLs directly in a private window and confirm they return the app instead of a 404: `/product`, `/pricing`, `/live-demo`, `/book-demo`, `/case-studies`, `/policies`, `/privacy`, `/terms`.
3. Open the widget, close it and confirm the greeting bubble does not reappear during the same browser session.
4. Confirm the launcher appears promptly and `Powered by teviq.in` opens `https://www.teviq.in/`.
5. Confirm the website Vercel project still has its valid `VITE_WEB3FORMS_KEY`.

## 4. Run the real Shopify order privacy test

Use a Shopify dev-store checkout order containing a test email or phone.

1. Correct order number plus correct contact must return order status.
2. Correct order number plus wrong contact must return the generic verification failure.
3. Invalid order number must return the same generic verification failure.
4. Five failed attempts should trigger the configured cooldown.
5. Check Render logs and Supabase records; the submitted email/phone must not appear in plaintext logs or analytics.

## 5. Finish Shopify public-distribution requirements

1. In Shopify app configuration, register `customers/data_request`, `customers/redact` and `shop/redact` at `https://teviq-support-ai-backend.onrender.com/api/integrations/shopify/webhooks`.
2. Verify the active version requests only `read_products,read_orders,read_fulfillments`.
3. Complete Shopify protected customer data approval before connecting production merchants or submitting publicly.
4. Trigger Shopify's compliance webhook tests and confirm HTTP 200 responses.
5. Keep the current custom/dev-store pilot until Shopify review is complete.

## 6. Verify authenticated dashboard paths

1. Sign in with Clerk in a private window.
2. Confirm Knowledge and Shopify requests include `Authorization: Bearer <JWT>` and do not include demo auth headers.
3. Test Overview, Conversations, Knowledge, AI Playground, Shopify, Analytics, Widget Install and Settings.
4. Log out, refresh, sign in again and confirm no stale demo session remains.
5. Repeat once at a 390px mobile viewport.

## 7. Turn on failure notifications

1. Enable GitHub Actions failure email notifications for the backend repository.
2. Manually run **Production Health** after deployment.
3. Optionally add the same public URLs to an external uptime monitor for faster alerts than GitHub's scheduled runner.

## Pilot launch gate

Start with one controlled pilot brand after sections 1-4 pass. Public Shopify App Store distribution remains blocked until section 5 is complete.
