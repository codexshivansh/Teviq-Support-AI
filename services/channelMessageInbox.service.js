async function rest(path, options = {}) {
  const url = String(process.env.SUPABASE_URL || '').replace(/\/$/, '');
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('channel_inbox_not_configured');
  const response = await fetch(`${url}/rest/v1/${path}`, {
    ...options,
    signal: AbortSignal.timeout(8000),
    headers: {
      apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json',
      ...options.headers
    }
  });
  if (!response.ok) throw new Error(`channel_inbox_store_${response.status}`);
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

async function enqueueChannelMessages(channel, messages, resolveConnection) {
  if (!messages.length) return;
  if (!['whatsapp', 'instagram'].includes(channel)) throw new Error('channel_inbox_invalid_channel');
  const rows = [];
  const connections = new Map();
  for (const item of messages) {
    const accountId = channel === 'whatsapp' ? item.phoneNumberId : item.instagramAccountId;
    if (![accountId, item.messageId, item.from, item.text].every(value => typeof value === 'string' && value.trim())) {
      throw new Error('channel_inbox_invalid_event');
    }
    if (!connections.has(accountId)) connections.set(accountId, await resolveConnection(accountId));
    const connection = connections.get(accountId);
    if (!connection?.brandId) throw new Error('channel_inbox_connection_unavailable');
    const eventAt = channel === 'whatsapp'
      ? new Date(Number(item.timestamp) * 1000) : new Date(item.timestamp);
    if (!item.timestamp || !Number.isFinite(eventAt.getTime())) throw new Error('channel_inbox_invalid_timestamp');
    rows.push({ channel, account_id: accountId, message_id: item.messageId,
      brand_id: connection.brandId, customer_id: item.from, message: item.text,
      event_at: eventAt.toISOString() });
  }
  // One transaction for the whole parsed batch. Existing rows are immutable on
  // redelivery; retries cannot reset status or replace another workspace's data.
  await rest('channel_message_inbox?on_conflict=channel,account_id,message_id', {
    method: 'POST', headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' },
    body: JSON.stringify(rows)
  });
}

async function claimChannelMessage(workerId) {
  const rows = await rest('rpc/claim_channel_message', {
    method: 'POST', body: JSON.stringify({ p_worker_id: workerId })
  });
  return rows?.[0] || null;
}

async function transitionChannelMessage(event, action, values = {}) {
  const changed = await rest('rpc/transition_channel_message', {
    method: 'POST', body: JSON.stringify({ p_id: event.id, p_worker_id: event.worker_id,
      p_action: action, p_reply: values.reply || null,
      p_provider_message_id: values.providerMessageId || null, p_error_code: values.errorCode || null })
  });
  if (changed !== true) throw new Error('channel_inbox_ownership_lost');
}

async function listChannelMessageReviews(brandId, before) {
  const query = new URLSearchParams({ brand_id: `eq.${brandId}`, status: 'eq.needs_review',
    select: 'id,channel,customer_id,message,reply,event_at,error_code,updated_at', order: 'id.desc', limit: '51' });
  if (before) query.set('id', `lt.${before}`);
  const rows = await rest(`channel_message_inbox?${query}`);
  return { items: rows.slice(0, 50), nextCursor: rows.length > 50 ? String(rows[49].id) : null };
}

async function reviewChannelMessage({ id, brandId, actorId, action, reason }) {
  return rest('rpc/review_channel_message', { method: 'POST', body: JSON.stringify({
    p_id: id, p_brand_id: brandId, p_actor_id: actorId, p_action: action, p_reason: reason }) });
}

async function applyProviderMessageStatus({ channel, accountId, messageId, status, timestamp, failureCategory = null }) {
  if (!['whatsapp', 'instagram'].includes(channel) || !accountId || !messageId || !timestamp) return 0;
  const rows = await rest('rpc/apply_provider_message_status', { method: 'POST', body: JSON.stringify({
    p_channel: channel, p_account_id: String(accountId), p_message_id: String(messageId),
    p_status: status, p_status_at: timestamp, p_failure_category: failureCategory
  }) });
  return Number(rows) || 0;
}

async function recordProviderMessageAccepted({ channel, accountId, messageId, brandId, customerId, timestamp = new Date().toISOString() }) {
  if (!['whatsapp','instagram'].includes(channel) || !accountId || !messageId || !brandId || !customerId) return false;
  return rest('rpc/record_provider_message_accepted', { method: 'POST', body: JSON.stringify({
    p_channel: channel, p_account_id: String(accountId), p_message_id: String(messageId),
    p_brand_id: String(brandId), p_customer_id: String(customerId), p_status_at: timestamp
  }) });
}

async function linkProviderMessageToLatestChatLog({ brandId, customerId, channel, reply, messageId }) {
  if (!brandId || !customerId || !reply || !messageId || !['whatsapp','instagram'].includes(channel)) return false;
  return rest('rpc/link_provider_message_to_latest_chat_log', { method: 'POST', body: JSON.stringify({
    p_brand_id: String(brandId), p_customer_id: String(customerId), p_channel: channel,
    p_reply: String(reply), p_message_id: String(messageId)
  }) });
}

async function listProviderMessageStatuses(brandId, channel, messageIds) {
  const ids = [...new Set(messageIds.filter(Boolean).map(String))];
  if (!ids.length || !['whatsapp', 'instagram'].includes(channel)) return [];
  const rows = [];
  // Bound each Data API URL while avoiding one request per conversation.
  for (let offset = 0; offset < ids.length; offset += 100) {
    const chunk = ids.slice(offset, offset + 100);
    const query = new URLSearchParams({ brand_id: `eq.${brandId}`, channel: `eq.${channel}`,
      provider_message_id: `in.(${chunk.map(id => `"${id.replaceAll('"', '')}"`).join(',')})`,
      select: 'provider_message_id,provider_status,provider_status_at,provider_failure_category,delivered_at,read_at' });
    rows.push(...await rest(`provider_message_statuses?${query}`));
  }
  return rows;
}

module.exports = { enqueueChannelMessages, claimChannelMessage, transitionChannelMessage, listChannelMessageReviews, reviewChannelMessage, applyProviderMessageStatus, recordProviderMessageAccepted, linkProviderMessageToLatestChatLog, listProviderMessageStatuses };
