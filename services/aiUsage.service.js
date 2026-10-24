const { randomUUID } = require('node:crypto');

const MODEL_PRICES_USD_PER_MILLION = {
  'openai/gpt-oss-20b': { input: 0.075, output: 0.30 }
};

function meteringEnabled() {
  return process.env.AI_TRIAL_METERING_ENABLED === 'true';
}

function getConfig() {
  const url = String(process.env.SUPABASE_URL || '').replace(/\/$/, '');
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!url || !key) throw new Error('AI usage store is not configured');
  return { url, key };
}

async function rest(path, options = {}) {
  const { url, key } = getConfig();
  const response = await fetch(`${url}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });
  const raw = await response.text();
  const data = raw ? JSON.parse(raw) : null;
  if (!response.ok) throw new Error(data?.message || `AI usage store returned ${response.status}`);
  return data;
}

async function reserveAiCall({ brandId, channel = 'widget', model, prompt, maxCompletionTokens }) {
  if (!meteringEnabled()) return null;
  if (!brandId) throw new Error('AI usage requires a brand ID');
  const id = randomUUID();
  // A byte is a conservative upper bound for ordinary UTF-8 prompt tokenization.
  // Include the system message and output ceiling so concurrent calls reserve
  // capacity before Groq is contacted, not after it has already been billed.
  const reservedTokens = Buffer.byteLength(String(prompt || ''), 'utf8') +
    Buffer.byteLength('You are a concise e-commerce customer support assistant. Always finish the answer in 80 words or fewer.', 'utf8') +
    maxCompletionTokens;
  const globalMaxTokens = Number(process.env.AI_TRIAL_GLOBAL_TOKENS_PER_DAY || 100000);
  const result = await rest('rpc/reserve_ai_usage', {
    method: 'POST',
    body: JSON.stringify({
      p_id: id,
      p_brand_id: brandId,
      p_channel: channel,
      p_model: model,
      p_reserved_tokens: reservedTokens,
      p_global_max_tokens: globalMaxTokens
    })
  });
  if (result !== 'allowed') {
    const error = new Error('The AI trial usage limit has been reached. Please contact the support team.');
    error.code = 'ai_trial_limit';
    error.limitReason = result;
    throw error;
  }
  return { id };
}

async function finishAiCall(reservation, usage) {
  if (!reservation) return;
  const total = Number(usage?.total_tokens);
  const known = Number.isFinite(total) && total >= 0;
  await rest('rpc/finish_ai_usage', {
    method: 'POST',
    body: JSON.stringify({
      p_id: reservation.id,
      p_prompt_tokens: known ? Math.max(0, Number(usage?.prompt_tokens) || 0) : null,
      p_completion_tokens: known ? Math.max(0, Number(usage?.completion_tokens) || 0) : null,
      p_total_tokens: known ? total : null
    })
  });
}

async function getAiUsageSummary(brandId) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(new Date());
  const part = (type) => parts.find(item => item.type === type)?.value;
  const today = `${part('year')}-${part('month')}-${part('day')}`;
  const [limits, events] = await Promise.all([
    rest(`ai_trial_limits?brand_id=eq.${encodeURIComponent(brandId)}&select=*`),
    rest(`ai_usage_events?brand_id=eq.${encodeURIComponent(brandId)}&usage_day=eq.${today}&select=status,prompt_tokens,completion_tokens,total_tokens,reserved_tokens,channel,model`)
  ]);
  const calls = events.length;
  const tokens = events.reduce((sum, row) => sum + (row.total_tokens ?? row.reserved_tokens), 0);
  const inputTokens = events.reduce((sum, row) => sum + (row.prompt_tokens || 0), 0);
  const outputTokens = events.reduce((sum, row) => sum + (row.completion_tokens || 0), 0);
  const estimatedUsd = events.reduce((sum, row) => {
    const price = MODEL_PRICES_USD_PER_MILLION[row.model];
    return price ? sum + ((row.prompt_tokens || 0) * price.input + (row.completion_tokens || 0) * price.output) / 1000000 : sum;
  }, 0);
  return {
    day: today,
    meteringEnabled: meteringEnabled(),
    trial: limits[0] || null,
    calls,
    tokens,
    inputTokens,
    outputTokens,
    estimatedUsd,
    hasUnknownUsage: events.some(row => row.status !== 'completed')
  };
}

async function saveTrialLimit(brandId, values) {
  const rows = await rest('ai_trial_limits?on_conflict=brand_id', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
    body: JSON.stringify({ brand_id: brandId, ...values, updated_at: new Date().toISOString() })
  });
  return rows[0];
}

module.exports = { meteringEnabled, reserveAiCall, finishAiCall, getAiUsageSummary, saveTrialLimit };
