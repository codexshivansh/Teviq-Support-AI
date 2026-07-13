const assert = require("assert");
const { detectIntent } = require("../brain/intentEngine");
const { routeTools } = require("../brain/toolRouter");
const { assessReplyConfidence, buildExtractiveKnowledgeFallback } = require("../services/ai.service");
const { detectEscalation } = require("../services/escalation.service");

const brand = {
  brandId: "test-brand",
  brandName: "Test Brand",
  escalationRules: {
    hardKeywords: ["fraud", "scam", "legal", "police", "consumer court", "battery blast"]
  },
  contact: {
    phone: "+91 9999999999",
    email: "support@example.com"
  }
};

function installModuleMock(relativePath, exports) {
  const resolvedPath = require.resolve(relativePath);
  require.cache[resolvedPath] = {
    id: resolvedPath,
    filename: resolvedPath,
    loaded: true,
    exports
  };
}

function createSupportBrainHarness() {
  let aiMode = "confident";
  let aiCalls = 0;
  let conversationState = { state: "idle", context: {}, updatedAt: null };

  installModuleMock("../services/brand.service", {
    getBrandById: async (brandId) => ({ ...brand, brandId })
  });
  installModuleMock("../services/memory.service", {
    getConversationMemory: () => [],
    addConversationMessage: () => {}
  });
  installModuleMock("../services/conversationState.service", {
    getState: async () => conversationState,
    setState: async (_brandId, _customerId, _channel, state, context) => {
      conversationState = { state, context, updatedAt: new Date().toISOString() };
    }
  });
  installModuleMock("../services/analytics.service", {
    appendChatLog: async () => {}
  });
  installModuleMock("../knowledge/retrieval.service", {
    retrieveKnowledge: async () => ({
      confidence: 0.2,
      lowConfidence: true,
      matches: [],
      citations: [],
      contextText: ""
    })
  });
  installModuleMock("../services/ai.service", {
    generateSupportReply: async () => {
      aiCalls += 1;
      return aiMode === "confident"
        ? {
            reply: "I can help with this based on the available support information.",
            source: "gemini",
            confidence: "medium",
            needsEscalation: false
          }
        : {
            reply: "I do not have enough confirmed information to answer this.",
            source: "gemini",
            confidence: "low",
            needsEscalation: true
          };
    }
  });

  delete require.cache[require.resolve("../brain/supportBrain")];
  const { processMessage } = require("../brain/supportBrain");

  return {
    processMessage,
    setAiMode(mode) {
      aiMode = mode;
    },
    setConversationState(state) {
      conversationState = state;
    },
    getConversationState() {
      return conversationState;
    },
    getAiCalls() {
      return aiCalls;
    }
  };
}

const supportBrainHarness = createSupportBrainHarness();

const teviqProductQuestions = [
  "Mere store par 4,000 products hain. Teviq ko train hone mein realistically kitna time lagega?",
  "Agar meri return policy Shopify aur uploaded PDF mein different ho, AI kis source ko follow karega?",
  "Widget install karne ke baad kya mujhe har product manually add karna padega?",
  "Can Teviq answer questions differently for prepaid and COD customers?",
  "How do you measure whether an AI response is actually resolved?",
  "What happens when two uploaded documents contain contradictory refund rules?",
  "Agar answer knowledge base mein nahi hai, Teviq guess karega ya support team ko transfer karega?",
  "Is one brand's customer data ever used to answer another brand's customer?"
];

const cases = [
  {
    name: "Teviq product questions are not hijacked by commerce keywords",
    run() {
      for (const question of teviqProductQuestions) {
        assert.equal(detectIntent(question, "teviq"), "general_faq", question);
      }
    }
  },
  {
    name: "customer return policy question is informational",
    run() {
      assert.equal(detectIntent("What is your return policy?", "test-brand"), "general_faq");
      assert.equal(detectIntent("Can I return my order?", "test-brand"), "return_exchange");
      assert.equal(
        detectIntent("Check return eligibility for order TVQ1001", "test-brand"),
        "return_exchange"
      );
    }
  },
  {
    name: "first order text does not match FIR",
    run() {
      assert.equal(detectEscalation("Do I get a discount on my first order?", brand).escalated, false);
    }
  },
  {
    name: "legal policy question stays answerable",
    run() {
      assert.equal(detectEscalation("What is your legal return policy?", brand).escalated, false);
    }
  },
  {
    name: "authenticity question stays answerable",
    run() {
      assert.equal(detectEscalation("Is this product fake or original?", brand).escalated, false);
    }
  },
  {
    name: "explicit fraud and police threat remains hard escalation",
    run() {
      assert.equal(detectEscalation("This is fraud, I will call police", brand).escalated, true);
    }
  },
  {
    name: "physical assault is a hard escalation",
    run() {
      const message = "delivery boy slapped me";
      assert.equal(detectEscalation(message, brand).escalated, true);
      assert.equal(detectIntent(message, brand.brandId), "complaint");

      const result = routeTools({ brand, intent: "complaint", entities: {}, message });
      assert.equal(result.allowAI, false);
      assert.equal(result.escalated, true);
      assert.match(result.reply, /WhatsApp|Email/i);
    }
  },
  {
    name: "actionable return intent wins over complaint tone",
    run() {
      assert.equal(detectIntent("I am not satisfied, can I return my order?", brand.brandId), "return_exchange");
    }
  },
  {
    name: "ordinary complaint routes to AI",
    run() {
      const result = routeTools({
        brand,
        intent: "complaint",
        entities: {},
        message: "This was a terrible experience. Can you explain what happened?"
      });
      assert.equal(result.allowAI, true);
      assert.equal(result.escalated, false);
    }
  },
  {
    name: "explicit human support request is recorded as escalation",
    run() {
      const result = routeTools({
        brand,
        intent: "human_support",
        entities: {},
        message: "I want to talk to support"
      });
      assert.equal(result.allowAI, false);
      assert.equal(result.escalated, true);
    }
  },
  {
    name: "confident AI answer does not escalate without retrieval",
    run() {
      const result = assessReplyConfidence("You can exchange a delivered item within the policy window.", {
        knowledge: { lowConfidence: true }
      });
      assert.equal(result.needsEscalation, false);
    }
  },
  {
    name: "AI uncertainty triggers escalation",
    run() {
      const result = assessReplyConfidence("I do not have enough confirmed information to answer this.", {
        knowledge: { lowConfidence: true }
      });
      assert.equal(result.needsEscalation, true);
    }
  },
  {
    name: "Hinglish AI uncertainty triggers escalation",
    run() {
      const result = assessReplyConfidence("Mere paas confirmed information nahi hai.", {
        knowledge: { lowConfidence: true }
      });
      assert.equal(result.needsEscalation, true);
    }
  },
  {
    name: "large catalog does not inherit generic setup timeline",
    run() {
      const context = {
        message: "Mere store par 4,000 products hain. Setup mein kitna time lagega?",
        knowledge: {
          lowConfidence: false,
          matches: [
            {
              text: "Q: Setup mein kitna time lagta hai? A: Teviq usually goes live in under 15 minutes."
            }
          ]
        }
      };

      assert.equal(buildExtractiveKnowledgeFallback(context), null);
      assert.equal(
        assessReplyConfidence("Teviq usually goes live in under 15 minutes.", context).needsEscalation,
        true
      );
      assert.equal(
        assessReplyConfidence(
          "Teviq usually goes live in under 15 minutes, but exact setup time for this catalog needs assessment.",
          context
        ).needsEscalation,
        false
      );
    }
  },
  {
    name: "support brain sends ordinary complaint to AI",
    async run() {
      supportBrainHarness.setAiMode("confident");
      const callsBefore = supportBrainHarness.getAiCalls();
      const result = await supportBrainHarness.processMessage({
        brandId: brand.brandId,
        message: "This was a terrible experience. Please explain what happened.",
        customerId: "confident-complaint"
      });

      assert.equal(supportBrainHarness.getAiCalls(), callsBefore + 1);
      assert.equal(result.source, "gemini");
      assert.equal(result.escalated, false);
    }
  },
  {
    name: "unrelated question clears stale contact collection",
    async run() {
      supportBrainHarness.setConversationState({
        state: "collecting_contact",
        context: { pendingIntent: "human_support" },
        updatedAt: new Date().toISOString()
      });
      supportBrainHarness.setAiMode("confident");
      const callsBefore = supportBrainHarness.getAiCalls();
      const result = await supportBrainHarness.processMessage({
        brandId: "teviq",
        message: "Is one brand's customer data ever used to answer another brand's customer?",
        customerId: "stale-contact-state"
      });

      assert.equal(supportBrainHarness.getAiCalls(), callsBefore + 1);
      assert.equal(result.intent, "general_faq");
      assert.equal(result.escalated, false);
      assert.equal(supportBrainHarness.getConversationState().state, "idle");
    }
  },
  {
    name: "support brain bypasses AI for physical assault",
    async run() {
      supportBrainHarness.setAiMode("confident");
      const callsBefore = supportBrainHarness.getAiCalls();
      const result = await supportBrainHarness.processMessage({
        brandId: brand.brandId,
        message: "delivery boy slapped me",
        customerId: "physical-assault"
      });

      assert.equal(supportBrainHarness.getAiCalls(), callsBefore);
      assert.equal(result.intent, "complaint");
      assert.equal(result.source, "system");
      assert.equal(result.escalated, true);
    }
  },
  {
    name: "support brain escalates after AI reports low confidence",
    async run() {
      supportBrainHarness.setAiMode("uncertain");
      const callsBefore = supportBrainHarness.getAiCalls();
      const result = await supportBrainHarness.processMessage({
        brandId: brand.brandId,
        message: "This was a terrible experience and I need a specific answer.",
        customerId: "uncertain-complaint"
      });

      assert.equal(supportBrainHarness.getAiCalls(), callsBefore + 1);
      assert.equal(result.source, "system");
      assert.equal(result.escalated, true);
      assert.match(result.reply, /escalat/i);
    }
  }
];

async function run() {
  let failed = false;

  for (const testCase of cases) {
    try {
      await testCase.run();
      console.log(`PASS ${testCase.name}`);
    } catch (error) {
      failed = true;
      console.error(`FAIL ${testCase.name}: ${error.message}`);
    }
  }

  if (failed) process.exit(1);
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
