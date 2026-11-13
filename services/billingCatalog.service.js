// Test fixtures only. Commercial caps/taxes require approval before live checkout.
const plans = [
  { id: 'starter-test-v1', name: 'Starter', amount_paise: 99900, features: ['widget'] },
  { id: 'standard-test-v1', name: 'Standard', amount_paise: 249900, features: ['widget', 'whatsapp'] },
  { id: 'growth-test-v1', name: 'Growth', amount_paise: 319900, features: ['widget', 'whatsapp', 'instagram'] }
].map(plan => Object.freeze({ ...plan, currency: 'INR', duration_days: 30, max_calls_per_day: 30, max_tokens_per_day: 30000 }));
module.exports = { plans };
