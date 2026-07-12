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
//   node scripts/seed-teviq-faqs.js
//
// Requires backend/.env to already have SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
// and GEMINI_API_KEY set (same values the live app uses).

require("dotenv").config();
const { createFaq } = require("../knowledge/structuredKnowledge.service");

const BRAND_ID = "teviq";

const FAQS = [
  {
    tags: ["trial", "pricing"],
    en: {
      question: "Can I try Teviq before paying?",
      answer:
        "Yes, Teviq comes with a 7-day free trial so you can test it on your live store before committing to a paid plan."
    },
    hi: {
      question: "Kya main Teviq ko paise dene se pehle try kar sakta hoon?",
      answer:
        "Haan, Teviq ka 7-din ka free trial hai jisse aap apne live store pe test kar sakte ho paid plan lene se pehle."
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
      answer: "About 15 minutes. Just add one script tag to your site and the widget is live."
    },
    hi: {
      question: "Setup mein kitna time lagta hai?",
      answer: "Karib 15 minute. Bas ek script tag apni site pe add karo aur widget live ho jayega."
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
      answer: "It escalates to your team instead of guessing, along with the full conversation so far."
    },
    hi: {
      question: "Agar AI kisi question ka jawab nahi de pa raha to kya hota hai?",
      answer: "Wo guess karne ke bajaye aapke team ko escalate kar deta hai, poori conversation ke saath."
    }
  },
  {
    tags: ["whatsapp", "channels", "roadmap"],
    en: {
      question: "Can customers reach support through WhatsApp?",
      answer:
        "Not yet — right now Teviq is a website widget only. WhatsApp and Instagram support are planned as part of an upcoming Growth plan, no fixed launch date yet."
    },
    hi: {
      question: "Kya customers WhatsApp pe support le sakte hain?",
      answer:
        "Abhi nahi — filhaal Teviq sirf website widget hai. WhatsApp aur Instagram support ek upcoming Growth plan ka hissa honge, koi fixed launch date abhi nahi hai."
    }
  },
  {
    tags: ["data", "privacy", "retention"],
    en: {
      question: "Do you store customer conversations?",
      answer:
        "Yes, conversations are stored securely and scoped to your brand only, so your team can review them. They're retained for 30 days and then permanently deleted."
    },
    hi: {
      question: "Kya aap customer conversations store karte ho?",
      answer:
        "Haan, conversations securely stored hote hain aur sirf aapke brand tak limited rehte hain, taaki team review kar sake. Ye 30 din tak rakhe jaate hain fir permanently delete ho jaate hain."
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
        "₹999/month for our first 10 clients, with that rate locked for your first 3 months. After that, new signups pay ₹1,999/month. If a Growth plan (adding WhatsApp/Instagram, ₹3,999/month) launches while you're still in your 3-month lock-in, you can upgrade early for just ₹1,999 extra on top of your locked rate."
    },
    hi: {
      question: "Teviq ki cost kya hai?",
      answer:
        "Hamare pehle 10 clients ke liye ₹999/month hai, ye rate first 3 months ke liye locked rehta hai. Uske baad, naye signups ₹1,999/month pay karenge. Agar Growth plan (WhatsApp/Instagram ke saath, ₹3,999/month) aapke 3-month lock-in ke andar launch hota hai, to aap sirf ₹1,999 extra deke early upgrade kar sakte ho apne locked rate ke upar."
    }
  },
  {
    tags: ["cancellation", "billing"],
    en: {
      question: "Can I cancel anytime?",
      answer:
        "Yes. There's no minimum commitment — the 3-month period only locks in your price, not a contract. You can cancel anytime during or after it."
    },
    hi: {
      question: "Kya main kabhi bhi cancel kar sakta hoon?",
      answer:
        "Haan. Koi minimum commitment nahi hai — 3-month period sirf aapka price lock karta hai, koi contract nahi. Aap kabhi bhi cancel kar sakte ho, uske andar ya baad mein."
    }
  },
  {
    tags: ["refund", "billing"],
    en: {
      question: "Do you offer refunds?",
      answer:
        "The 7-day trial is free, so there's nothing to refund during it. Once you're on a paid plan, we don't offer refunds for that billing period."
    },
    hi: {
      question: "Kya aap refund dete ho?",
      answer: "7-din ka trial free hai, to usme refund ka sawal hi nahi. Paid plan lene ke baad, us billing period ka refund nahi diya jaata."
    }
  },
  {
    tags: ["support", "sla"],
    en: {
      question: "How fast does your team respond if something needs a human?",
      answer: "We aim to respond within 24 hours of an escalation or support request."
    },
    hi: {
      question: "Agar kisi cheez ke liye human chahiye to aapka team kitni jaldi respond karta hai?",
      answer: "Hum escalation ya support request ke 24 hours ke andar respond karne ki koshish karte hain."
    }
  },
  {
    tags: ["analytics", "performance"],
    en: {
      question: "Can I see how well Teviq is performing?",
      answer: "Yes, the Analytics page in your dashboard shows total chats, resolution rate, escalations, and average response time."
    },
    hi: {
      question: "Kya main dekh sakta hoon Teviq kitna accha perform kar raha hai?",
      answer: "Haan, dashboard ke Analytics page pe total chats, resolution rate, escalations, aur average response time dikhta hai."
    }
  },
  {
    tags: ["contact", "support"],
    en: {
      question: "How do I reach the Teviq team directly?",
      answer: "Phone/WhatsApp: +91 9555144436, Email: helloteviq@gmail.com"
    },
    hi: {
      question: "Teviq team se directly kaise contact karoon?",
      answer: "Phone/WhatsApp: +91 9555144436, Email: helloteviq@gmail.com"
    }
  }
];

async function run() {
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

run().catch((error) => {
  console.error("[seed-teviq-faqs] Unexpected failure:", error);
  process.exitCode = 1;
});
