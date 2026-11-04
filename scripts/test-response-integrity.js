const assert = require("assert");
const { isIncompleteReply } = require("../services/ai.service");
const { validateResponse } = require("../brain/responseValidator");

function baseContext() {
  return {
    brand: {
      managerContact: {
        whatsapp: "+919555144436",
        email: "helloteviq@gmail.com"
      }
    },
    policyConflict: null,
    order: null,
    policyResult: null,
    intent: "general_faq",
    entities: {}
  };
}

function run() {
  for (const reply of [
    'Your Teviq subscription has been cancelled.',
    'Cancellation confirmed.',
    'I have deleted all your data.',
    'I’m transferring you to a human support agent.',
    'Subscription cancel kar diya.'
  ]) {
    const context = baseContext();
    context.brand.brandId = 'teviq';
    const result = validateResponse({ reply, context, source: 'groq', escalated: false });
    assert.ok(result.warnings.includes('unsupported_account_action_removed'), reply);
    assert.equal(result.forceEscalation, true);
    assert.match(result.finalReply, /cannot perform or confirm/);
    assert.match(result.finalReply, /helloteviq@gmail.com/);
  }
  for (const reply of [
    'You can cancel at any time by contacting support.',
    'I cannot cancel your subscription. Please contact support.',
    'Payment confirmation and explicit activation are required after the trial.'
  ]) {
    const context = baseContext();
    context.brand.brandId = 'teviq';
    assert.equal(validateResponse({ reply, context, source: 'groq', escalated: false }).finalReply, reply);
  }
  const merchant = validateResponse({ reply: 'Your subscription has been cancelled.', context: baseContext(), source: 'system', escalated: false });
  assert.equal(merchant.warnings.length, 0);
  assert.equal(isIncompleteReply("For our first clients, Teviq is", "STOP"), true);
  assert.equal(isIncompleteReply("A complete response.", "STOP"), false);
  assert.equal(isIncompleteReply("A complete response.", "MAX_TOKENS"), true);
  assert.equal(isIncompleteReply("Yes, it is", "STOP"), false);

  const incomplete = validateResponse({
    reply: "For a beginner who wants a",
    context: baseContext(),
    source: "groq",
    escalated: false
  });
  assert.equal(incomplete.finalReply, "Sorry, I could not complete that response. Please try again.");
  assert.ok(incomplete.warnings.includes("incomplete_ai_reply_replaced"));

  const markdown = validateResponse({
    reply: "**Fast setup** - add one script tag.",
    context: baseContext(),
    source: "gemini",
    escalated: false
  });
  assert.equal(markdown.finalReply, "Fast setup - add one script tag.");

  const longReply = Array.from({ length: 15 }, (_, index) =>
    `Sentence ${index + 1} contains enough words to make this response intentionally longer.`
  ).join(" ");
  const trimmed = validateResponse({
    reply: longReply,
    context: baseContext(),
    source: "gemini",
    escalated: false
  });
  assert.ok(trimmed.finalReply.endsWith("."));
  assert.ok(trimmed.finalReply.split(/\s+/).length <= 80);

  console.log("PASS incomplete provider replies are detected");
  console.log("PASS incomplete customer replies are replaced safely");
  console.log("PASS customer-facing markdown is normalized");
  console.log("PASS long replies end at a complete sentence");
}

try {
  run();
} catch (error) {
  console.error(`FAIL ${error.stack || error.message}`);
  process.exitCode = 1;
}
