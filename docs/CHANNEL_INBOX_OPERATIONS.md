# Durable channel inbox: rollout and recovery

Status: local implementation, not deployed. Migration 0028 requires the existing brands table and migration 0024's Instagram event table.

## Release order

1. Back up the database and verify the staging environment. Apply 0028–0036 in order on staging; run two backend instances against it and exercise simultaneous duplicate delivery and conversation ordering. Embedded PostgreSQL tests are not a substitute for this contention test.
2. Confirm WhatsApp's app secret belongs to the Meta app sending the webhooks, and both channel secrets are configured. Never print secrets in the release log.
3. Confirm the Meta app is subscribed to WhatsApp message status updates and Instagram's `messaging_seen` webhook field. Leave `INSTAGRAM_SEEN_WEBHOOK_FORMAT` blank until a signed callback verifies the exact `read.mid` direction and shape; only then select `read_mid_v1` and run the callback smoke test.
4. Apply the additive migration before deploying these routes and the worker together. Never deploy the new routes alone: queued messages need a running worker.
5. Check persisted event, reply, provider message ID and final status with synthetic test accounts. Validate both channels and authenticated-role access denial.

## Behaviour

- Verified incoming text messages are saved before HTTP 200. A storage/connection-resolution error returns 503 so Meta can retry. WhatsApp status callbacks are parsed separately from inbound text and update only a matching channel/account/provider ID. Instagram seen parsing is fail-closed until its signed callback format is verified; there is no Instagram delivered state.
- Unique channel/account/message IDs prevent repeat processing. The full parsed batch is stored in one insert transaction.
- Workspace ownership is captured on receipt and checked again before processing. Access tokens are not stored in this inbox.
- The worker polls every two seconds. Database ownership and conversation ordering work across multiple instances. Events from other conversations can proceed when one conversation needs review.
- A generated answer is saved before delivery. A restart can resume a saved answer without another model call.
- A crash during AI/actions or sending has uncertain side effects. These events become `needs_review` after their lease expires; they are NOT replayed automatically. Later messages in that same conversation wait for resolution.
- Legacy Instagram event redeliveries are quarantined, because the old event table lacks enough details for safe migration.
- Events at least 23 hours old are held for review, providing a safety margin before channel messaging windows expire.
- `accepted` means the provider accepted the API request, not proof the customer received or read it. WhatsApp receipts may advance to delivered/read/failed; read implies delivery evidence. Instagram may advance to seen, but never to delivered without evidence. Missing receipt remains status uncertain.
- Migrations 0034–0036 add status metadata and transcript links, track automated and manual outbound provider IDs, and remove linkable provider status rows during scoped customer erasure. No full payload or credentials are retained.

## Operations still required before production rollout

Local dashboard Delivery review and conversation takeover are implemented with migrations 0029 and 0030; apply and verify both on staging before release. External notification delivery remains pending. Operators must inspect uncertain events against provider records before deciding whether to mark resolved, send manually within the permitted window, or explicitly resend an existing saved reply after checking it was not delivered. Generation is not automatically replayed. Never reset all events to pending or delete deduplication rows to retry. A reviewed replay action needs actor/reason audit history and ownership checks.

Inbox contains customer message text and generated replies. Include it in workspace/customer deletion handling and the final retention/backup policy. Workspace deletion cascades through the brand foreign key; individual-customer deletion integration remains a release gate.

Do not roll back blindly to the older webhook handlers: they can replay events without the inbox guard. If rollback is needed, stop intake/worker in a coordinated maintenance window, preserve all rows, and reconcile queued/uncertain events before reopening traffic. No destructive down migration is supplied.

## Local evidence

`npm run test:channel-inbox` runs migration SQL in disposable embedded PostgreSQL and exercises uniqueness, ownership fencing, ordering, restart recovery, uncertain delivery, changed workspace ownership, old-message protection and access denial. Providers are mocked.

`npm run test:whatsapp-webhook-security` checks signatures and proves acknowledgement waits for storage, with 503 on storage failure and no inline AI call.
