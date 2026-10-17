# Instagram Messaging Integration

Status: webhook, OAuth, dashboard connection controls, and manual replies are deployed. The Meta app was published on 17 October 2026. A real incoming DM and automated reply were verified after publication. Advanced Access review and a separate live manual-reply test remain outstanding.

## Verified operational checkpoint — 17 October 2026

- Meta confirmed that the Teviq app was successfully published. Its Publish page now shows `Published` and offers `Unpublish`.
- Meta's `messages` sample webhook test reported success. This verifies the sample delivery test, not a real customer conversation or an AI reply.
- The `helloteviq` account is listed in Instagram API setup with its account webhook subscription On, and the `messages` field is subscribed.
- The last real DM test before publication did not appear in the dashboard. A fresh DM after publication produced a processed webhook-event record, an Instagram chat-log row with an AI reply, and a dashboard conversation. The account owner also confirmed receiving the reply in Instagram. This verifies the tested account's inbound-to-AI-reply flow; it does not establish Advanced Access for other customers' accounts.
- The review draft requests `instagram_business_basic` and `instagram_business_manage_messages`; Advanced Access has not been approved. Screencasts, reviewer access/instructions, and data-handling answers still need completion.
- Application logs do not record every successful webhook request. An empty Render application-log window is therefore not proof that no request arrived; inspect webhook-event storage or request diagnostics before concluding that delivery failed.

App publication and Advanced Access approval are separate states. Check the actual Publish page instead of assuming that an unfinished Advanced Access review prevents publication.

## Goal

Route Instagram Direct Messages into the same brand-scoped Teviq Support Brain used by the website widget and WhatsApp. Instagram messages use the `instagram` channel value so their conversation state and dashboard history stay channel-specific.

## Current implementation

- `services/instagram.service.js` normalizes inbound text messages, ignores business-account echoes and unsupported non-text messages, resolves the connected Teviq brand, decrypts its stored access token, verifies Meta webhook signatures, and sends text replies through Instagram's Graph API.
- `routes/instagram.routes.js` implements Meta's webhook verification handshake and signed inbound webhook endpoint. Valid text messages are routed to `supportBrain.processMessage()` with `channel: "instagram"`; the shared Brain owns the `chat_logs` write, avoiding duplicate transcript rows.
- `instagram_webhook_events` stores inbound message IDs so Meta webhook retries do not trigger duplicate AI responses.
- `services/instagramCustomerProfiles.service.js` enriches dashboard conversations with the sender's current Instagram username/name through the connected brand account. Profiles are cached in memory for one hour (failed lookups for one minute), scoped by brand/account/sender, with a 500-entry cap, four concurrent calls, and a 2.5-second provider lookup budget per inbox load. Tokens stay in server-side Authorization headers. No new database migration or permission is required. A missing/private/unavailable profile does not hide the conversation; the dashboard displays `Instagram user` instead of treating the scoped sender ID as a phone number. The actual ID remains unchanged for routing and replies.
- `integrations/instagram/instagramOAuth.service.js` creates a short-lived, hashed, one-time OAuth state; requests the current Instagram Login scopes; exchanges the code for a long-lived token; fetches the authorized account identity; encrypts the token before persistence; and exposes no token through status APIs.
- `controllers/instagram.controller.js` and `routes/instagram.routes.js` expose authenticated status/connect/disconnect endpoints. OAuth connect and disconnect reject local demo sessions.
- `dashboard/src/pages/Settings.jsx` provides the connect/disconnect card; `dashboard/src/pages/Conversations.jsx` supports manual Instagram replies while the customer-service window is open.
- `supabase/migrations/0024_add_instagram_connections.sql` creates the connection, OAuth-state, and webhook-event tables. Run this migration in Supabase before deploying this backend code.
- `scripts/test-instagram-service.js` covers webhook normalization, echo/media filtering, invalid object handling, and valid/invalid webhook signatures.
- `scripts/test-instagram-oauth.js` and `scripts/test-instagram-manual-reply.js` cover OAuth state/token storage and manual-reply window/auth behavior with mocked provider calls.
- `integrations/instagram/instagramTokenRefresh.service.js` refreshes active long-lived tokens within seven days of expiry through an internal-cron endpoint; tokens younger than 24 hours are deferred, and expired connections are marked for reconnect.

## Not implemented yet

- Meta App Review / Advanced Access and a production-account end-to-end test.
- Production scheduling of the protected token-refresh endpoint.
- Delivery/read status, media handling, and webhook retry recovery tooling.

Do not describe Instagram as live until the OAuth flow is configured, the database migration is run, the webhook is subscribed, and an end-to-end test succeeds. The dashboard Instagram filter alone does not mean the channel is connected.

## Meta setup prerequisites

1. Use an Instagram Professional account (Business or Creator). The account currently planned for testing is `helloteviq`.
2. Create/configure a Meta developer app for Instagram messaging using Instagram Login.
3. Add the current permissions `instagram_business_basic` and `instagram_business_manage_messages`. Register the OAuth callback shown below and configure the public webhook callback at `/api/instagram/webhook` with the `messages` webhook field.
4. Use an account authorized for app testing. To test replies, send the first DM from the customer/test account; the API is not an unrestricted cold-outreach channel.
5. Keep the Meta App Secret, access tokens, and webhook verify token out of source control, browser code, screenshots, and chat. Access tokens must be stored encrypted in `instagram_connections.access_token_encrypted`.

## Backend configuration

Configure these server-side environment values after the app is created:

| Variable | Purpose |
| --- | --- |
| `INSTAGRAM_APP_ID` | Instagram app ID shown under Instagram API setup with Instagram Login; this can differ from the parent Meta app ID. |
| `INSTAGRAM_APP_SECRET` | Validates `X-Hub-Signature-256` and is used server-side for OAuth token exchange. |
| `INSTAGRAM_REDIRECT_URI` | Exact registered OAuth callback; defaults to `${PUBLIC_API_URL}/api/instagram/oauth/callback`. |
| `INSTAGRAM_WEBHOOK_VERIFY_TOKEN` | Chosen random secret used for Meta's webhook verification handshake. |
| `INSTAGRAM_GRAPH_API_VERSION` | Graph API version; currently defaults to `v26.0`, and can be overridden per deployment. |
| `SHOPIFY_CREDENTIALS_SECRET` | Existing server-side encryption key used to encrypt/decrypt the Instagram access token. |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | Existing server-only Supabase REST credentials. |

The webhook endpoint also needs a public HTTPS backend URL. Do not enable it in Meta until the matching environment values and migration are deployed.

### OAuth endpoints

- `POST /api/instagram/:brandId/connect` (Clerk-authenticated and brand-authorized): returns an Instagram authorization URL. Only a real Clerk session can initiate linking; local demo sessions are rejected.
- `GET /api/instagram/oauth/callback`: consumes the one-time state, exchanges the authorization code, reads the granted Instagram account identity, encrypts its long-lived token, stores the connection, and redirects to the dashboard Settings page.
- `GET /api/instagram/:brandId/status`: returns connection metadata and OAuth-configured status, never the token.
- `DELETE /api/instagram/:brandId/connection`: removes the stored connection and token; requires a real Clerk session and brand authorization.
- `POST /api/instagram/:brandId/send`: sends a signed-in human reply and records it in `chat_logs`. It checks the latest inbound customer message and fails closed outside the 23-hour safety window.
- `POST /internal/refresh-instagram-tokens` (protected by `INTERNAL_CRON_SECRET`): refreshes tokens expiring within seven days. Schedule it daily. It never returns or logs token values.

Before OAuth can succeed, configure `INSTAGRAM_APP_ID`, `INSTAGRAM_APP_SECRET`, `INSTAGRAM_REDIRECT_URI` (or `PUBLIC_API_URL`), and the existing server-side token-encryption secret. The callback URI must exactly match the one registered in the Meta app. No credentials are committed to this repository.

## Message flow

```text
Customer DM
  -> Meta webhook POST
  -> verify signature and deduplicate message ID
  -> resolve Instagram account to Teviq brand in Supabase
  -> decrypt token on the backend
  -> supportBrain.processMessage(channel="instagram")
  -> send text reply through Graph API
  -> append the exchange to chat_logs
  -> dashboard Conversations filter
```

## Next engineering steps

1. Record the now-working connection/profile and real-DM-to-AI-reply flow for App Review. Retest immediately before recording, then complete reviewer instructions and the owner's data-handling answers. The observed review draft is autosaved and showed no immediate submission deadline.
2. Schedule the protected token-refresh endpoint daily using the existing internal cron setup.
3. Add integration tests for inbound brand lookup, event deduplication, AI routing, and provider send failures.
4. Complete the broader knowledge refresh only after the Instagram integration is stable; the Brain uses the shared brand knowledge across channels.

## References

- [Meta Instagram API with Instagram Login](https://www.postman.com/meta/instagram/folder/6raa77c/instagram-api-with-instagram-login)
- [Meta Instagram API with Instagram Login collection overview](https://www.postman.com/meta/instagram/folder/1z5vxzu/instagram-api-with-instagram-login)
- [Meta Instagram Send API](https://www.postman.com/meta/instagram/documentation/6yqw8pt/instagram-api?entity=request-23987686-1ff01566-3509-48bd-a0f4-8571a91ccfdf)
