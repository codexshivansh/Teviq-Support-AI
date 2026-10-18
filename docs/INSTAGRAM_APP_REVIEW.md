# Instagram App Review preparation

Updated: 18 October 2026. App publication is complete; Advanced Access review is still a draft. The reviewed permissions are `instagram_business_basic` and `instagram_business_manage_messages`.

## Current checkpoint

- Real Instagram incoming messages, shared Brain replies, received replies, sender usernames, and the dashboard transcript have been verified.
- The reply-window lookup and inbox refresh fixes are deployed. The inbox refreshes every 15 seconds while visible and when focus/visibility returns.
- The Meta reviewer-instructions draft now describes dashboard access, Instagram Login, connected-account identification, real DM testing, AI replies, and manual replies. Facebook Login is marked No because this integration uses Instagram Login; Teviq dashboard authentication uses Clerk.
- Reviewer credentials, screencasts, data-handling answers, and owner usage confirmations are outstanding. Do not submit until the dedicated reviewer account described in the instructions actually exists and can access its review workspace.

## Recording run sheet

Use a clean test workspace and test accounts. Keep UI text, the harmless test message, and its actual reply readable. Hide passwords, tokens, unrelated customer conversations, browser autofill, and notifications. Pause recording if authentication would expose a secret.

1. Optionally introduce Teviq's business purpose briefly: AI-assisted support for brands. The website overview is context; the app workflow is the evidence.
2. In Teviq Settings, show Connect Instagram and the real Instagram Login consent flow for a Professional account. Keep only the requested profile and messaging access. Avoid disconnecting the production connection merely to film; agree on a test account/workspace first.
3. Return to Settings and show the connected Instagram username. This demonstrates basic profile identification, which is also a dependency of the messaging permission.
4. From a separate Instagram test account, send a new harmless text DM, such as “What services does this business offer?” Show the actual send.
5. In Teviq Conversations, select Instagram and wait for the new conversation. Show the sender username, the same incoming text, and the Teviq Brain response.
6. Return to the sending Instagram account and show that the actual response arrived in the same DM thread.
7. If demonstrating agent assistance, send a short manual reply from the dashboard while the customer window is open; show its Human reply label and receipt in Instagram.

The screencast must demonstrate the real workflow. A Meta sample webhook, screenshots of backend logs, or a verbal promise that a reply will be sent is not a replacement for that working experience. Recording Render or Supabase is unnecessary for the customer-facing demonstration and can expose credentials or unrelated data.

Meta currently provides a screencast upload field for each requested permission. Make each permission's use easy to identify in the footage. No immediate submission deadline was shown in the inspected draft.

## Reviewer access to provision before submission

Provisioning checkpoint (18 October 2026): the isolated `teviq-meta-review`
workspace, displayed as **Teviq Meta Review**, has been created and read back
successfully. No customer history or production connection was copied. The
owner-supplied reviewer email was checked and is not an existing Clerk user.
The owner entered the password and submitted Clerk's production Create User
form. Account existence and password-enabled status were verified via Clerk.
The account was assigned only this workspace, with no admin role; metadata was
read back successfully. A targeted middleware check allowed the assigned
workspace and returned 403 for two other workspace IDs. This is not a live
end-to-end authorization test. The owner successfully signed in through a
separate Brave private window. The dashboard initially displayed first-time
onboarding because the pre-provisioned account lacked setup metadata. Existing
workspace identity/language metadata and `onboarding_complete: true` were added
to this reviewer only, without creating another brand or connecting a provider.
Live dashboard verification succeeded: the signed-in account opens Teviq Meta
Review (no workspace selector), and Settings loads the correct brand with a
Connect Instagram control. It correctly shows no Instagram account connected
to this clean workspace. The existing production connection was not moved or
disconnected. Non-secret login instructions were entered in Meta's designated
test-credentials field; the owner supplied the password directly and reported
completion. Meta displayed Auto-saved and Reviewer instructions reached 100%.
The password was not inspected or copied. This workspace's Instagram workflow
is not yet tested. No credentials are stored here.

- A dedicated Teviq reviewer login with access to a clean review workspace, not the owner's personal production workspace.
- A supported way to sign in without requiring a code sent only to the owner. Do not disable production authentication protections to facilitate review.
- Confirm that this login can reach Settings, connect a Professional account, and use the Instagram inbox. Keep it usable for the review period and follow the duration requested by Meta's form.
- Enter the Teviq test credentials directly into Meta's designated field. Do not put passwords in this document, source control, recording, or chat. Meta's profile instructions specifically say not to supply Instagram account credentials.
- Do not claim that credentials have been supplied until the dedicated login has been tested and the designated field is populated.

## Data-handling facts and owner answers

Implementation update: see [Groq-only mode](GROQ_ONLY_MODE.md). The owner
confirmed Gemini uses the free tier and declined new billing costs. The Groq-only
backend is deployed, and an isolated synthetic chat returned a Groq-sourced
reply. Inference API Zero Data Retention is enabled in the signed-in Groq
Personal / Default Project organization. Before making a compliance claim,
confirm the deployed key belongs to that organization. Google/Gemini is no
longer called by the current backend.

The code confirms that third-party processors are used. The form must not say that no processors access Platform Data.

| Provider to verify in the submission | Observed role |
| --- | --- |
| Render | Executes backend processing, including webhook payloads and server-side credentials. |
| Supabase | Stores conversation history, connection metadata, and encrypted Instagram access tokens. |
| Groq | Receives customer-support prompts and recent conversation context to generate replies. |

Verify the contracting legal entities, applicable service regions and live configuration before entering provider details. Clerk authenticates dashboard users and Vercel hosts the dashboard; check their actual Platform Data exposure instead of assuming that every infrastructure vendor receives Instagram message data.

Owner-supplied answers still needed:

- The actual person or legal entity responsible for Platform Data, and its country. A product trading name alone does not establish this.
- Whether any covered national-security disclosures occurred in the past 12 months.
- Which public-authority request review, challenge, minimization and documentation processes are actually in place.
- Confirmation that actual data use complies with the allowed usage for each requested permission.

Data-handling draft checkpoint (18 October 2026): the owner confirmed personal
responsibility as Shivansh Gupta, located in India. Those fields were entered.
The owner answered No to national-security disclosures during the past 12 months;
No was selected. After the current-process options were explained, the owner
approved selecting None of the above; no new government-request policy was
claimed to exist. Third-party processors was set to Yes based on the known
implementation. Meta requires each provider's name, service categories and all
processing/access countries. Provider entries remain unfilled pending verified
locations; do not infer countries merely from headquarters or a server region.
The review has not been submitted.

### Provider-location evidence checked on 18 October 2026

- Render service Settings shows **Ohio (US East)** for the live backend.
- Supabase project General settings shows **ap-northeast-2, Northeast Asia
  (Seoul)**, i.e. South Korea, for the live database.
- These are hosting regions, not complete remote-access country declarations.
  [Supabase's residency FAQ](https://supabase.com/legal/privacy-resources/data-residency-and-transfers-faq)
  explicitly describes globally distributed support and processing outside the
  selected database region. It identifies Supabase Pte. Ltd. (Singapore) as the
  primary processor for ordinary agreements, with a marketplace exception.
  Verify the actual contract rather than assuming the older Supabase, Inc. name.
- [Render security disclosures](https://render.com/security) list subprocessor
  entity countries, not an exhaustive country list for remote personnel access.
- [Groq's current DPA](https://console.groq.com/docs/legal/customer-data-processing-addendum)
  allows processing in the United States and other countries where Groq or its
  subprocessors operate. Check its current trust-center subprocessor disclosures
  before treating USA as exhaustive.
- Gemini was removed from the backend customer-data processing path after
  confirming the configured Google API was on the unpaid tier. Historical
  Gemini terms research is retained in the Groq-only implementation notes; it
  does not describe the current production path.
- No provider entry has been saved with guessed countries; no billing,
  production credentials, service region or model routing has been changed.

Retain chat history according to the published request-based deletion process. Fixed automatic 7/30-day deletion is not enabled. Never add a fixed deadline or security/process claim that is not implemented.

## Final submission checkpoint

Check that the two permission descriptions, working screencasts, tested reviewer access, truthful data-handling responses and owner confirmations are complete. Submit only the requested profile/messaging review; do not add unrelated comments, publishing, insights or Human Agent access to complete the form.
