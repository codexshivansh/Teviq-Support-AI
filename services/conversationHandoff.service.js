async function request(path, options = {}) {
  const base = String(process.env.SUPABASE_URL || '').replace(/\/$/, '');
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!base || !key) throw new Error('handoff_store_not_configured');
  const response = await fetch(`${base}/rest/v1/${path}`, { ...options,
    signal: AbortSignal.timeout(8000),
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' } });
  if (!response.ok) throw new Error('handoff_store_unavailable');
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

async function getConversationHandoff({ brandId, channel, customerId }) {
  const query = new URLSearchParams({ brand_id: `eq.${brandId}`, channel: `eq.${channel}`,
    customer_id: `eq.${customerId}`, select: 'paused,owner_id,updated_at', limit: '1' });
  const rows = await request(`conversation_handoffs?${query}`);
  return rows?.[0] || { paused: false, owner_id: null };
}

async function setConversationHandoff({ brandId, channel, customerId, actorId, paused }) {
  await request('rpc/set_conversation_handoff', { method: 'POST', body: JSON.stringify({
    p_brand_id: brandId, p_channel: channel, p_customer_id: customerId, p_actor_id: actorId, p_paused: paused }) });
}

module.exports = { getConversationHandoff, setConversationHandoff };
