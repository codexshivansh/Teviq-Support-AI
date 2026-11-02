const { randomUUID } = require('node:crypto');
const store = require('./channelMessageInbox.service');

function createChannelMessageWorker({ inbox = store, processMessage, whatsapp, instagram, getHandoff = async () => ({ paused: false }), report = console.error }) {
  let running = false;
  async function processEvent(event) {
    const adapter = event.channel === 'whatsapp' ? whatsapp : instagram;
    try {
      // Never send an old queued reply outside the customer's messaging window.
      const age = Date.now() - Date.parse(event.event_at);
      if (!Number.isFinite(age) || age < -60000 || age >= 23 * 60 * 60 * 1000) {
        await inbox.transitionChannelMessage(event, 'needs_review', { errorCode: 'reply_window_requires_review' });
        return;
      }
      const connection = await adapter.resolve(event.account_id);
      if (!connection || connection.brandId !== event.brand_id) {
        await inbox.transitionChannelMessage(event, 'needs_review', { errorCode: 'connection_changed' });
        return;
      }
      const scope = { brandId: event.brand_id, channel: event.channel, customerId: event.customer_id };
      if ((await getHandoff(scope)).paused) {
        await inbox.transitionChannelMessage(event, 'needs_review', { errorCode: 'human_takeover' });
        return;
      }
      let reply = event.reply;
      if (!reply) {
        const result = await processMessage({ brandId: event.brand_id, customerId: event.customer_id,
          message: event.message, channel: event.channel, requestIp: `${event.channel}-messaging-api` });
        reply = result?.reply;
        if (!reply) throw new Error('empty_reply');
        await inbox.transitionChannelMessage(event, 'ready', { reply });
      }
      // Durable fence before external delivery. Crash/timeout after this point
      // is ambiguous, so never automatically send a second copy.
      if ((await getHandoff(scope)).paused) {
        await inbox.transitionChannelMessage(event, 'needs_review', { errorCode: 'human_takeover' });
        return;
      }
      // Processing can outlast the remaining reply window. Recheck immediately
      // before the durable send fence, including recovered saved replies.
      const sendAge = Date.now() - Date.parse(event.event_at);
      if (!Number.isFinite(sendAge) || sendAge < -60000 || sendAge >= 23 * 60 * 60 * 1000) {
        await inbox.transitionChannelMessage(event, 'needs_review', { errorCode: 'reply_window_requires_review' });
        return;
      }
      await inbox.transitionChannelMessage(event, 'sending');
      const sent = await adapter.send(event, connection, reply);
      const providerMessageId = sent?.messages?.[0]?.id || sent?.message_id || null;
      await inbox.transitionChannelMessage(event, 'sent', { providerMessageId });
      if (providerMessageId) await store.recordProviderMessageAccepted({ channel: event.channel, accountId: event.account_id,
        messageId: providerMessageId, brandId: event.brand_id, customerId: event.customer_id }).catch(() => {});
      if (providerMessageId) await store.linkProviderMessageToLatestChatLog({ brandId: event.brand_id,
        customerId: event.customer_id, channel: event.channel, reply, messageId: providerMessageId }).catch(() => {});
    } catch (_) {
      report('[channel-inbox] Event requires reconciliation', { id: event.id, channel: event.channel });
      await inbox.transitionChannelMessage(event, 'needs_review', { errorCode: 'processing_or_delivery_uncertain' }).catch(() => {});
    }
  }

  async function drain() {
    if (running) return;
    running = true;
    try {
      for (let i = 0; i < 20; i++) {
        const event = await inbox.claimChannelMessage(randomUUID());
        if (!event) break;
        await processEvent(event);
      }
    } catch (_) {
      report('[channel-inbox] Store unavailable; queued messages remain pending');
    } finally { running = false; }
  }
  return { drain, processEvent };
}

function startChannelMessageWorker() {
  const { processMessage } = require('../brain/supportBrain');
  const wa = require('./whatsapp.service');
  const ig = require('./instagram.service');
  const { getConversationHandoff } = require('./conversationHandoff.service');
  const worker = createChannelMessageWorker({ processMessage, getHandoff: getConversationHandoff,
    whatsapp: { resolve: wa.resolveBrandFromPhoneNumberId, send: (e, c, reply) => wa.sendWhatsAppMessage({
      phoneNumberId: e.account_id, to: e.customer_id, text: reply, accessToken: c.accessToken }) },
    instagram: { resolve: ig.resolveBrandFromInstagramAccountId, send: (e, c, reply) => ig.sendInstagramMessage({
      instagramAccountId: e.account_id, to: e.customer_id, text: reply, accessToken: c.accessToken }) }
  });
  void worker.drain();
  const timer = setInterval(() => void worker.drain(), 2000);
  timer.unref();
  return () => clearInterval(timer);
}

module.exports = { createChannelMessageWorker, startChannelMessageWorker };
