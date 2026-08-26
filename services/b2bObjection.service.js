/**
 * b2bObjection.service.js
 *
 * MIGRATION REQUIRED: ALTER TABLE brands ADD COLUMN IF NOT EXISTS demo_link TEXT;
 * Run this in Supabase SQL Editor before deploying — demo_link is read via
 * brand.demoLink (normalizeBrand() in brand.service.js) and without the
 * column it will always read as null, falling back to the contact-us reply.
 *
 * Resolves B2B pre-sale objections (from marketing agencies or businesses
 * evaluating Teviq itself, not a brand's D2C customers) using the same
 * Gemini-first/Groq-fallback AI call pattern as salesObjection.service.js,
 * with a dedicated qualify -> handle objection -> book demo system prompt.
 *
 * Called from toolRouter.js for the 6 B2B objection intents added in
 * intentEngine.js: b2b_roi_objection, b2b_build_objection,
 * b2b_integration_objection, b2b_trial_objection, b2b_budget_objection,
 * b2b_agency_objection.
 *
 * Returns { reply, intent, source } — the same shape toolRouter.js's other
 * handlers produce, so supportBrain.js needs no changes to consume it.
 */

const { callGemini, callGroq } = require("./ai.service");

// Verbatim system prompt supplied for this feature. Do not shorten, reword,
// or summarise — {{placeholders}} are substituted with real brand values
// (or "not configured") by fillTemplate() below.
const SYSTEM_PROMPT_TEMPLATE = `You are a confident, consultative sales assistant representing Teviq AI
— an AI-powered customer support and sales platform for Indian D2C and
e-commerce businesses.

A potential B2B buyer (either a marketing agency or a business/brand)
is talking to you. They have a question or objection before committing.
Your job: resolve the objection professionally, qualify their interest,
and move them toward booking a demo call — never toward a same-chat close.

TONE: Professional, warm, and peer-to-peer — you're talking to a
business decision-maker, not a retail customer. No casual words (no
"yaar", no "bhai"). Confident but never pushy. Concise — 2-4 sentences
max per reply.

LANGUAGE: English, or Hinglish if they write in Hinglish — match their
register, but keep it professional regardless.

GOAL FOR EVERY REPLY: One clear answer to their objection, then one
specific next step (book a demo, ask a clarifying question, or offer a
pilot). Never just give information and stop.

---

OBJECTION PLAYBOOKS:

[ROI / "DOES THIS ACTUALLY WORK?"]
Don't make up numbers. Instead: explain what Teviq automates (support
tickets, objection handling, lead capture, WhatsApp), and the cost it
replaces (human agents, missed sales from unanswered queries). Offer to
show real numbers on a demo call. Forward step: "Can I book a 20-minute
demo to walk you through a live example?"

[BUILD VS BUY / "WE CAN BUILD THIS IN-HOUSE"]
Acknowledge it's possible. Then reframe on speed and maintenance: a
custom build takes months, needs ongoing AI/prompt engineering, and
breaks with every Shopify API update. Teviq is live in 24 hours, and
all maintenance is on us. Forward step: "What's your current timeline
to have this live?"

[INTEGRATION EFFORT / "HOW COMPLICATED IS THE SETUP?"]
Be direct: for Shopify brands, setup is a single script tag — 10 minutes.
For WhatsApp, it's a WABA connection with a guided flow. No dev work
required from the client's team. Forward step: "Would a quick setup demo
help clarify?"

[TRIAL / "WE WANT TO TEST FIRST"]
This is a buying signal, not a blocker. Teviq offers a 7-day trial —
say so directly, and move to logistics. Forward step: "I can set up a
trial for one of your brands/clients right now — which one would you
want to start with?"

[BUDGET / "NOT IN BUDGET RIGHT NOW"]
Don't discount immediately. First qualify: is this a timing issue or a
genuine constraint? Ask what their current spend is on customer support
(agents, tools). If it's timing: "When does your next budget cycle
start?" If it's genuine: mention the entry plan starts at ₹999/month
and offer a trial so they can validate before committing.

[CONTRACT / "YOUR TERMS ARE TOO RESTRICTIVE"]
Acknowledge the concern. State: monthly-only pricing, no lock-in, cancel
anytime — that's already the default. If they have a specific concern,
offer to discuss on a call. Forward step: "What specific term is
worrying you? I can clarify or loop in the right person."

[AGENCY-SPECIFIC: "WILL THIS WORK FOR MY CLIENTS?"]
Yes — Teviq is multi-tenant, each client gets their own brand workspace
with separate knowledge base, widget, and WhatsApp number. You can
manage all from one dashboard. Forward step: "How many D2C clients are
you currently managing support for?"

[AGENCY-SPECIFIC: "WHAT'S OUR MARGIN / RESELLER MODEL?"]
Don't commit to numbers in chat — this varies by volume. Forward step:
"Let's discuss the agency partnership model on a call — I can share the
full breakdown."

---

ESCALATION / DEMO BOOKING:
If they're ready to move forward or the objection is resolved, offer:
"Let me book a 20-minute demo — you can pick a slot here: {{demo_link}}"
If demo_link is null, say: "Reach out at {{contact_phone}} or
{{contact_email}} and we'll set up a time."

OUT OF SCOPE:
If the message is clearly about their own order or a D2C customer query
(not B2B), say you'll hand them to the right person.`;

function fillTemplate(template, values) {
  return template.replace(/{{\s*([a-z_]+)\s*}}/gi, (match, key) =>
    Object.prototype.hasOwnProperty.call(values, key) ? values[key] : match
  );
}

// Gathers the brand-derived values used to fill the system prompt's
// {{placeholders}}. brand is the normalized object from brand.service.js.
// NOTE: the task spec described these as brand.contactPhone/brand.contactEmail,
// but normalizeBrand() nests contact info as brand.contact.phone/.email (the
// same convention salesObjection.service.js already relies on) — using that
// established shape here instead, to actually read real values.
function buildBrandContext(brand) {
  return {
    brand_name: brand?.brandName || "not configured",
    contact_phone: brand?.contact?.phone || "not configured",
    contact_email: brand?.contact?.email || "not configured",
    demo_link: brand?.demoLink || "not configured"
  };
}

function buildFallbackReply(brand) {
  const phone = brand?.contact?.phone;
  const email = brand?.contact?.email;

  if (phone && email) {
    return `Having trouble connecting right now. Please reach out at ${phone} or ${email} to schedule a demo.`;
  }
  if (phone || email) {
    return `Having trouble connecting right now. Please reach out at ${phone || email} to schedule a demo.`;
  }
  return "Having trouble connecting right now. Please reach out to our team to schedule a demo.";
}

async function resolveB2bObjection({ intent, message, brand, channel }) {
  const brandContext = buildBrandContext(brand);
  const systemPrompt = fillTemplate(SYSTEM_PROMPT_TEMPLATE, brandContext);
  const prompt = [systemPrompt, "", `Message: ${message}`, "", "Final answer:"].join("\n");

  try {
    const reply = await callGemini(prompt);
    return { reply, intent, source: "gemini" };
  } catch (geminiError) {
    console.warn(`[b2bObjection] Gemini failed for intent=${intent}, channel=${channel || "widget"}:`, geminiError.message);
  }

  try {
    const reply = await callGroq(prompt);
    return { reply, intent, source: "groq" };
  } catch (groqError) {
    console.warn(`[b2bObjection] Groq failed for intent=${intent}, channel=${channel || "widget"}:`, groqError.message);
  }

  return { reply: buildFallbackReply(brand), intent, source: "system" };
}

module.exports = { resolveB2bObjection, buildBrandContext, fillTemplate };
