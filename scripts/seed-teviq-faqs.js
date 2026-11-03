// One-off script to seed the 15 new FAQ topics (English + Hinglish = 30 rows)
// straight into the real "teviq" brand's Knowledge Base.
//
// This calls structuredKnowledge.service.js's createFaq() directly — the exact
// same function the dashboard's "Add FAQ" button hits via the authenticated
// HTTP API — so each FAQ gets embedded and indexed into knowledge_chunks
// (source_type="faq") exactly like a manually-added one would, and shows up
// immediately in both the dashboard's FAQs tab and the widget's retrieval.
//
// Run from inside backend/:
//   node scripts/seed-teviq-faqs.js          (preview only)
//   node scripts/seed-teviq-faqs.js --apply          (adds rows)
//   node scripts/seed-teviq-faqs.js --replace --apply (replaces all Teviq FAQs)
//
// Requires backend/.env to already have SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
// set. Indexing is local; no embedding-provider API key is needed.

const BRAND_ID = "teviq";

const FAQS = [
  {
    tags: ["trial", "pricing"],
    en: {
      question: "Can I try Teviq before paying?",
      answer:
        "When offered and activated for your workspace, Teviq provides a 3-day free trial. Configured reply and AI usage limits apply. Confirm the limits in your trial details; a paid subscription is separate."
    },
    hi: {
      question: "Kya main Teviq ko paise dene se pehle try kar sakta hoon?",
      answer:
        "Offer aur workspace activation hone par Teviq ka 3-din ka free trial shuru hota hai. Configured reply aur AI usage limits apply hoti hain. Trial details mein limits confirm karein; paid subscription alag hai."
    }
  },
  {
    tags: ["platforms", "integration"],
    en: {
      question: "Which e-commerce platforms does Teviq work with?",
      answer:
        "Teviq installs on any website with a single script tag, so it works regardless of platform. A demo Shopify catalog/order connector is available today; live Shopify order sync is in progress."
    },
    hi: {
      question: "Teviq kaun-kaun se e-commerce platforms pe kaam karta hai?",
      answer:
        "Teviq kisi bhi website pe ek script tag add karke chal jata hai, platform koi bhi ho. Demo Shopify catalog/order connector abhi available hai; live Shopify order sync pe kaam chal raha hai."
    }
  },
  {
    tags: ["setup", "onboarding"],
    en: {
      question: "How long does setup take?",
      answer:
        "Installing the Teviq website widget usually takes 15–20 minutes. Instagram connection and testing usually take 15–30 minutes when the Instagram Professional account and required access are ready. WhatsApp Business connection and testing usually take 30–60 minutes when the WhatsApp Business account, eligible number, and required access are ready. These estimates assume required storefront or business-account access, permissions, and setup information are available when onboarding starts. Meta eligibility checks, verification, or approval can add waiting time outside Teviq's control and may extend the timeline from a few hours to several days. These are estimates, not guarantees. Shopify product or order-data connection is a separate setup step."
    },
    hi: {
      question: "Setup mein kitna time lagta hai?",
      answer:
        "Teviq website widget install karne mein aam taur par 15–20 minute lagte hain. Instagram Professional account aur zaroori access ready ho to connection aur testing mein 15–30 minute lagte hain. WhatsApp Business account, eligible number aur zaroori access ready ho to connection aur testing mein 30–60 minute lagte hain. Ye estimates tab apply hote hain jab onboarding shuru hote waqt zaroori storefront ya business-account access, permissions aur setup information available ho. Meta eligibility check, verification ya approval mein Teviq ke control se bahar wait ho sakta hai aur timeline kuch ghanton se kai din tak badh sakti hai. Ye estimates hain, guarantee nahi. Shopify product ya order-data connection alag setup step hai."
    }
  },
  {
    tags: ["languages"],
    en: {
      question: "What languages does Teviq support?",
      answer:
        "English, Hindi, and Hinglish. The AI detects which language a customer is using and replies in that same language."
    },
    hi: {
      question: "Teviq kaun-kaun si languages support karta hai?",
      answer:
        "English, Hindi, aur Hinglish. AI khud detect kar leta hai customer kaunsi language use kar raha hai aur ussi mein jawab deta hai."
    }
  },
  {
    tags: ["returns", "cancellations"],
    en: {
      question: "Can Teviq handle returns and cancellations on its own?",
      answer:
        "Teviq can guide customers through the return/cancellation flow and check eligibility against your policies, but it doesn't auto-approve anything — that stays with your team."
    },
    hi: {
      question: "Kya Teviq khud hi returns aur cancellations handle kar sakta hai?",
      answer:
        "Teviq customer ko return/cancellation process mein guide kar sakta hai aur policy ke against eligibility check kar sakta hai, lekin kuch bhi auto-approve nahi karta — final decision aapke team ke paas hi rehta hai."
    }
  },
  {
    tags: ["escalation", "fallback"],
    en: {
      question: "What happens if the AI can't answer a question?",
      answer: "It avoids guessing and can flag the conversation for review or provide the configured support contact. Your team should monitor escalations in the dashboard; a flag alone does not mean a human has replied."
    },
    hi: {
      question: "Agar AI kisi question ka jawab nahi de pa raha to kya hota hai?",
      answer: "AI guess karne ke bajaye conversation review ke liye flag kar sakta hai ya configured support contact de sakta hai. Aapki team dashboard mein escalations monitor kare; flag ka matlab human ne reply kar diya nahi hai."
    }
  },
  {
    tags: ["whatsapp", "instagram", "channels", "plans"],
    en: {
      question: "Can customers reach support through WhatsApp?",
      answer:
        "Teviq supports website chat, WhatsApp Business, and Instagram DMs. Which channels are included depends on your plan; accounts are connected during onboarding. Applicable WhatsApp message charges may be separate from the plan fee."
    },
    hi: {
      question: "Kya customers WhatsApp pe support le sakte hain?",
      answer:
        "Haan. Starter plan mein website support, Standard mein website + WhatsApp, aur Growth mein website + WhatsApp + Instagram support hai. Accounts onboarding ke dauraan connect hote hain. WhatsApp ke applicable message charges plan fee se alag ho sakte hain."
    }
  },
  {
    tags: ["data", "privacy", "retention"],
    en: {
      question: "Do you store customer conversations?",
      answer:
        "Conversations from connected website chat, WhatsApp, or Instagram may be stored in the brand's Teviq workspace and viewed by that brand's authorized team. Teviq does not automatically delete conversations after a fixed number of days. To request deletion, contact Teviq support or use the Data Deletion page. We verify requests and delete applicable Teviq records unless retention is required for legal or security reasons."
    },
    hi: {
      question: "Kya aap customer conversations store karte ho?",
      answer:
        "Connected website chat, WhatsApp ya Instagram conversations Teviq ke brand workspace mein store ho sakti hain aur us brand ki authorized team dekh sakti hai. Teviq fixed dinon ke baad conversations ko automatically delete nahi karta. Deletion request Teviq support ya Data Deletion page se bheji ja sakti hai; request verify karke applicable Teviq records delete kiye jaate hain, jab tak legal ya security reason se retain karna zaroori na ho."
    }
  },
  {
    tags: ["customization", "settings"],
    en: {
      question: "Can I customize what the widget says and looks like?",
      answer:
        "Yes — greeting message, quick-action buttons, theme color, and your support contact info are all editable from Settings in the dashboard."
    },
    hi: {
      question: "Kya main widget ka message aur look customize kar sakta hoon?",
      answer:
        "Haan — greeting message, quick-action buttons, theme color, aur support contact info sab dashboard ki Settings se edit ho sakte hain."
    }
  },
  {
    tags: ["pricing", "cost"],
    en: {
      question: "What does Teviq cost?",
      answer:
        "Teviq's current monthly plans are Starter ₹999 for website support, Standard ₹2,499 for website + WhatsApp, and Growth ₹3,199 for website + WhatsApp + Instagram. Applicable WhatsApp message charges may be separate from the plan fee."
    },
    hi: {
      question: "Teviq ki cost kya hai?",
      answer:
        "Teviq ke current monthly plans hain: Starter ₹999 — website support; Standard ₹2,499 — website + WhatsApp; Growth ₹3,199 — website + WhatsApp + Instagram. WhatsApp ke applicable message charges plan fee se alag ho sakte hain."
    }
  },
  {
    tags: ["cancellation", "billing"],
    en: {
      question: "Can I cancel anytime?",
      answer:
        "You can cancel your Teviq subscription anytime. There is no minimum commitment period or notice period. After cancellation, access continues until the end of the current billing cycle. If you later resubscribe, the then-current standard rate applies."
    },
    hi: {
      question: "Kya main kabhi bhi cancel kar sakta hoon?",
      answer:
        "Haan, Teviq subscription kabhi bhi cancel kar sakte hain. Koi minimum commitment ya notice period nahi hai. Cancel karne ke baad access current billing cycle ke end tak rahega. Baad mein resubscribe karne par us waqt ka standard rate lagega."
    }
  },
  {
    tags: ["refund", "billing"],
    en: {
      question: "Do you offer refunds?",
      answer:
        "The activated 3-day trial is free and subject to configured usage limits. Paid plan subscription charges are non-refundable, with no partial or prorated refund for unused billing-cycle time. Contact support about billing or setup issues."
    },
    hi: {
      question: "Kya aap refund dete ho?",
      answer: "Activated 3-din ka trial free hai aur configured usage limits apply hoti hain. Paid plan subscription charges refundable nahi hain; unused time ka partial ya prorated refund nahi milta. Billing ya setup issue ke liye support se contact karein."
    }
  },
  {
    tags: ["support", "sla"],
    en: {
      question: "How fast does your team respond if something needs a human?",
      answer: "Use the current support details and business hours shown in your dashboard. Describe urgent live issues clearly so the team can assess priority; an immediate response or resolution is not guaranteed."
    },
    hi: {
      question: "Agar kisi cheez ke liye human chahiye to aapka team kitni jaldi respond karta hai?",
      answer: "Dashboard mein current support details aur business hours dekhein. Urgent live issue ka impact clearly batayein taaki team priority assess kar sake; immediate reply ya resolution guaranteed nahi hai."
    }
  },
  {
    tags: ["analytics", "performance"],
    en: {
      question: "Can I see how well Teviq is performing?",
      answer: "Yes, the Analytics page in your dashboard shows conversation counts, deflection, escalations, and response-time metrics. Deflection means no escalation was recorded; it is not proof that a customer issue was resolved."
    },
    hi: {
      question: "Kya main dekh sakta hoon Teviq kitna accha perform kar raha hai?",
      answer: "Haan, dashboard ke Analytics page pe conversation counts, deflection, escalations aur response-time metrics dikhte hain. Deflection ka matlab escalation record nahi hui; issue resolve hone ka proof nahi."
    }
  },
  {
    tags: ["contact", "support"],
    en: {
      question: "How do I reach the Teviq team directly?",
      answer: "For the support team phone number, email and business hours, use the current contact details configured in your dashboard."
    },
    hi: {
      question: "Teviq team se directly kaise contact karoon?",
      answer: "For the support team phone number, email and business hours, use the current contact details configured in your dashboard."
    }
  }
];

async function run() {
  if (!process.argv.includes('--apply')) {
    console.log(JSON.stringify({ brandId: BRAND_ID, mode: 'preview-only', faqs: FAQS }, null, 2));
    return;
  }
  require('dotenv').config();
  const { createFaq, deleteItem, listItems } = require('../knowledge/structuredKnowledge.service');
  if (process.argv.includes('--replace')) {
    const existing = await listItems({ brandId: BRAND_ID, type: 'faq' });
    console.log(`Removing ${existing.length} existing FAQs before replacement`);
    for (const item of existing) {
      const result = await deleteItem({ brandId: BRAND_ID, itemId: item.id, type: 'faq' });
      if (!result.deleted) throw new Error(`Could not delete FAQ ${item.id}`);
    }
  }
  console.log(`Seeding ${FAQS.length * 2} FAQs (English + Hinglish) for brand "${BRAND_ID}"`);
  console.log("=".repeat(70));

  const results = [];

  for (const topic of FAQS) {
    for (const lang of ["en", "hi"]) {
      const faq = topic[lang];
      const preview = faq.question.length > 60 ? `${faq.question.slice(0, 60)}...` : faq.question;

      try {
        const result = await createFaq({
          brandId: BRAND_ID,
          question: faq.question,
          answer: faq.answer,
          tags: topic.tags
        });

        if (result.item) {
          console.log(`  OK   [${lang}] ${preview}`);
          results.push({ ok: true, question: faq.question });
        } else {
          console.log(`  FAIL [${lang}] ${preview}`);
          console.log(`       error: ${JSON.stringify(result.error)}`);
          results.push({ ok: false, question: faq.question, error: result.error });
        }
      } catch (error) {
        console.log(`  FAIL [${lang}] ${preview}`);
        console.log(`       error: ${error.message}`);
        results.push({ ok: false, question: faq.question, error: error.message });
      }
    }
  }

  const successCount = results.filter((r) => r.ok).length;
  const failCount = results.length - successCount;

  console.log("\n" + "=".repeat(70));
  console.log("SUMMARY");
  console.log(`Total attempted: ${results.length}`);
  console.log(`Successful: ${successCount}`);
  console.log(`Failed: ${failCount}`);

  if (failCount > 0) {
    console.log("\nFailed items:");
    results
      .filter((r) => !r.ok)
      .forEach((r) => console.log(`  - "${r.question}": ${JSON.stringify(r.error)}`));
    process.exitCode = 1;
  }
}

module.exports = { FAQS };

if (require.main === module) run().catch((error) => {
  console.error("[seed-teviq-faqs] Unexpected failure:", error);
  process.exitCode = 1;
});
