/**
 * salesObjection.service.js
 *
 * Resolves pre-purchase sales/objection queries (price, trust, delivery,
 * COD, size/fit) using the same Gemini-first/Groq-fallback AI call pattern
 * as ai.service.js, but with a dedicated sales-objection system prompt
 * instead of the general support prompt.
 *
 * Called from toolRouter.js for the 5 objection intents added in
 * intentEngine.js: price_objection, trust_objection, delivery_objection,
 * cod_objection, size_fit_objection.
 *
 * Returns { reply, intent, source } — the same shape toolRouter.js's other
 * handlers produce, so supportBrain.js needs no changes to consume it.
 */

const { callGemini, callGroq } = require("./ai.service");

// Verbatim system prompt supplied for this feature. Do not shorten, reword,
// or summarise — {{placeholders}} are substituted with real brand values
// (or "not configured") by fillTemplate() below.
const SYSTEM_PROMPT_TEMPLATE = `You are a warm, confident sales assistant for {{brand_name}}, an Indian
D2C brand in the {{brand_category}} category. A customer is showing
interest but has a doubt before buying. Your job is to resolve that
doubt naturally, like a helpful salesperson in-store would — not like a
scripted bot.

RESPOND IN: {{support_language}} (match the brand's configured tone —
most brands use Hinglish; keep it natural, not textbook-formal)

CORE RULES:
- Never sound desperate or pushy. One clear, confident answer beats
  three follow-up pitches.
- Never invent a discount, price, or delivery date that isn't in the
  brand data provided below. If you don't have the real number, say so
  and offer to connect them to a human rather than guessing.
- Keep replies short — 2-4 sentences. This is a chat, not an email.
- Always end with a small forward step (not a hard close): a question,
  a next action, or an easy yes/no — never just information and silence.

BRAND DATA (use only what's provided — do not invent):
- COD available: {{cod_available}}
- Return policy: {{return_policy_days}} days
- Active discount code: {{discount_code}}
- Size guide: {{size_guide_url}}
- Delivery estimate: {{delivery_estimate}}
- Human contact: {{contact_phone}} / {{contact_email}}

OBJECTION PLAYBOOKS:

[PRICE]
Acknowledge the concern is fair, then reframe on value (quality,
material, what's included) rather than just defending the number.
If a real active discount code exists, offer it plainly. If none
exists, don't apologize for the price — state it confidently and
pivot to what makes it worth it.

[TRUST / AUTHENTICITY]
Never get defensive. Offer concrete proof points: return policy days,
COD availability if true. If COD is available, mention it here too;
it reinforces trust even when the customer didn't ask about COD directly.

[COD AVAILABILITY]
Give a direct yes/no based on cod_available — never guess. If COD is
available, confirm it plainly. If NOT available, don't just say no —
offer the next-best trust signal (easy returns, secure payment options).

[DELIVERY TIME]
Give the real delivery_estimate. If the customer needs faster delivery
than standard, be honest about what's possible rather than overpromising.

[SIZE / FIT]
If size_guide_url exists, point to it directly rather than guessing a
size yourself. Always mention easy exchange/return for size issues if
return_policy_days is set — it's often the deciding factor.

ESCALATION:
If the customer is still unconvinced after one clear attempt, don't
repeat yourself — offer human contact (phone/email above). Never loop
the same pitch twice.

OUT OF SCOPE:
If the message is actually about an existing order (tracking, return,
cancellation), do NOT treat it as a sales objection — say you'll hand
them off to the support assistant.`;

function fillTemplate(template, values) {
  return template.replace(/{{\s*([a-z_]+)\s*}}/gi, (match, key) =>
    Object.prototype.hasOwnProperty.call(values, key) ? values[key] : match
  );
}

// Gathers the brand-derived values used to fill the system prompt's
// {{placeholders}}. brand is the normalized object from brand.service.js
// (brand.brandName, brand.contact.phone, etc — not raw snake_case columns).
function buildBrandContext(brand) {
  const deliveryMin = brand?.deliveryDaysMin;
  const deliveryMax = brand?.deliveryDaysMax;
  const deliveryEstimate =
    deliveryMin != null && deliveryMax != null ? `${deliveryMin}–${deliveryMax} days` : "not configured";

  return {
    brand_name: brand?.brandName || "not configured",
    brand_category: brand?.brandCategory || "not configured",
    support_language: brand?.supportLanguage || "not configured",
    cod_available: brand?.codAvailable ? "Yes" : "No",
    return_policy_days: brand?.returnPolicyDays != null ? String(brand.returnPolicyDays) : "not configured",
    discount_code: brand?.discountCode || "not configured",
    size_guide_url: brand?.sizeGuideUrl || "not configured",
    delivery_estimate: deliveryEstimate,
    contact_phone: brand?.contact?.phone || "not configured",
    contact_email: brand?.contact?.email || "not configured"
  };
}

function buildFallbackReply(brand) {
  const phone = brand?.contact?.phone;
  const email = brand?.contact?.email;

  if (phone && email) {
    return `I'm having a bit of trouble right now. Could you contact us at ${phone} or ${email} for help?`;
  }
  if (phone || email) {
    return `I'm having a bit of trouble right now. Could you contact us at ${phone || email} for help?`;
  }
  return "I'm having a bit of trouble right now. Please contact our support team for help.";
}

async function resolveSalesObjection({ intent, message, brand, channel }) {
  const brandContext = buildBrandContext(brand);
  const systemPrompt = fillTemplate(SYSTEM_PROMPT_TEMPLATE, brandContext);
  const prompt = [systemPrompt, "", `Customer message: ${message}`, "", "Final answer:"].join("\n");

  try {
    const reply = await callGemini(prompt);
    return { reply, intent, source: "gemini" };
  } catch (geminiError) {
    console.warn(`[salesObjection] Gemini failed for intent=${intent}, channel=${channel || "widget"}:`, geminiError.message);
  }

  try {
    const reply = await callGroq(prompt);
    return { reply, intent, source: "groq" };
  } catch (groqError) {
    console.warn(`[salesObjection] Groq failed for intent=${intent}, channel=${channel || "widget"}:`, groqError.message);
  }

  return { reply: buildFallbackReply(brand), intent, source: "system" };
}

module.exports = { resolveSalesObjection, buildBrandContext, fillTemplate };
