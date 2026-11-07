function parseAccessSettings(brandId, body) {
  const { enabled, startsAt, endsAt, maxCallsPerDay, maxTokensPerDay } = body;
  const mode = body.accessMode ?? (enabled ? 'trial' : 'disabled');
  const internal = mode === 'internal';
  const noCap = body.noCap ?? false;
  const start = Date.parse(startsAt), end = Date.parse(endsAt);
  if (!['trial','paid','disabled','internal'].includes(mode) ||
      typeof enabled !== 'boolean' || enabled !== (mode !== 'disabled') ||
      typeof noCap !== 'boolean' || (internal && brandId !== 'teviq') || (noCap && !internal) ||
      (!internal && (!Number.isFinite(start) || !Number.isFinite(end) || end <= start)) ||
      !Number.isSafeInteger(maxCallsPerDay) || maxCallsPerDay < 1 || maxCallsPerDay > 1000 ||
      !Number.isSafeInteger(maxTokensPerDay) || maxTokensPerDay < 1 || maxTokensPerDay > 100000) throw new Error('invalid_access_settings');
  return { enabled, access_mode: mode, no_cap: noCap,
    starts_at: internal ? null : new Date(start).toISOString(),
    ends_at: internal ? null : new Date(end).toISOString(),
    max_calls_per_day: maxCallsPerDay, max_tokens_per_day: maxTokensPerDay };
}
module.exports = { parseAccessSettings };
