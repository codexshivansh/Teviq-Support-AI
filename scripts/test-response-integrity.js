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
