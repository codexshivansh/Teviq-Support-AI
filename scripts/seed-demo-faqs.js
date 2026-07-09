const baseUrl = process.env.SEED_TARGET_URL || "http://localhost:5000";

const DEMO_FAQS = {
  "vastra-demo": [
    {
      question: "Sahi size kaise choose karu?",
      answer:
        "Har product page pe size chart diya gaya hai — apni chest/waist/hip measurement (inches mein) us chart se match karke size select karein. Agar do sizes ke beech confusion ho, thodi larger size lena recommended hai."
    },
    {
      question: "Return/exchange policy kya hai?",
      answer:
        "Delivery ke 7 din ke andar return/exchange available hai, bashart tags intact hon aur item unused ho. Innerwear aur customized items return eligible nahi hain."
    },
    {
      question: "Cash on delivery available hai?",
      answer:
        "Haan, COD available hai saare pin codes pe jaha hum deliver karte hain, ek chhota COD handling fee lag sakta hai."
    },
    {
      question: "Delivery mein kitna time lagta hai?",
      answer: "Metro cities mein 3-5 din, baaki India mein 5-8 business din lagte hain."
    },
    {
      question: "Kaunse payment methods accept karte ho?",
      answer: "UPI, credit/debit card, net banking, aur COD — sab available hain checkout pe."
    },
    {
      question: "Order cancel kaise karu?",
      answer:
        'Order shipped hone se pehle "My Orders" section se cancel kar sakte hain. Shipped hone ke baad cancellation possible nahi, delivery ke baad return kar sakte hain.'
    },
    {
      question: "Fabric ki care kaise karu?",
      answer:
        "Zyadatar items cold wash recommended karte hain, care label product ke saath attached hai — usi ko follow karein taaki fabric/print kharab na ho."
    },
    {
      question: "Mera order track kaise karu?",
      answer:
        'Order confirmation email/SMS mein tracking link milta hai, ya "My Orders" section se real-time status dekh sakte hain.'
    }
  ],
  "urban-demo": [
    {
      question: "Warranty kitni milti hai?",
      answer:
        "Zyadatar products pe 1 year manufacturer warranty hai; kuch premium items pe 2 years tak — exact warranty product page pe mention hoti hai."
    },
    {
      question: "Defective item mile to kya karu?",
      answer:
        "Delivery ke 7 din ke andar defect report karein, hum free replacement ya full refund provide karte hain — koi extra charge nahi."
    },
    {
      question: "Cash on delivery available hai?",
      answer:
        "Haan, COD available hai order value ₹5000 tak; usse upar prepaid orders hi accept hote hain."
    },
    {
      question: "Delivery time kya hai?",
      answer: "4-7 business din, metro cities mein thoda fast (2-4 din) ho sakta hai."
    },
    {
      question: "EMI option hai kya?",
      answer: "Haan, select credit cards pe no-cost EMI 3/6/9 months tak available hai checkout pe."
    },
    {
      question: "Order cancel kaise karu?",
      answer:
        "Dispatch hone se pehle app/website se cancel kar sakte hain; dispatch ke baad delivery lekar return process follow karna hoga."
    },
    {
      question: "Products genuine/original hain?",
      answer:
        "Haan, sab products directly authorized brand distributors se source kiye jaate hain, saath mein original invoice bhi milta hai."
    },
    {
      question: "Order track kaise karu?",
      answer:
        'Order ke saath tracking ID milta hai email/SMS pe, "Track Order" page pe daal ke live status dekh sakte hain.'
    }
  ],
  "beauty-demo": [
    {
      question: "Ingredients ya allergy info kaha milegi?",
      answer:
        "Har product page pe full ingredient list diya gaya hai. Agar koi known allergy hai, purchase se pehle ingredients zaroor check kar lein."
    },
    {
      question: "Return policy kya hai?",
      answer:
        "Sealed/unopened products 7 din ke andar return ho sakte hain. Hygiene reasons se opened/used beauty products return eligible nahi hain."
    },
    {
      question: "Cash on delivery available hai?",
      answer: "Haan, COD available hai, chhota handling fee lagta hai order pe."
    },
    {
      question: "Delivery mein kitna time lagta hai?",
      answer: "3-6 business din, metro cities mein usually fast."
    },
    {
      question: "Products ki expiry/shelf life kitni hoti hai?",
      answer:
        "Har product ki expiry date packaging pe print hoti hai; hum sirf fresh stock ship karte hain jiski shelf life kam se kam 12 mahine baaki ho delivery ke time."
    },
    {
      question: "Payment options kya hain?",
      answer: "UPI, card, net banking, aur COD sab available hain."
    },
    {
      question: "Order cancel kaise karu?",
      answer:
        'Dispatch se pehle "My Orders" se cancel kar sakte hain, dispatch ke baad cancellation possible nahi.'
    },
    {
      question: "Order track kaise karu?",
      answer: "Confirmation email/SMS mein tracking link milta hai, waha se live status dekhein."
    }
  ]
};

async function createFaq(brandId, faq) {
  const response = await fetch(`${baseUrl}/api/knowledge/${brandId}/faqs`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-teviq-demo-auth": "true"
    },
    body: JSON.stringify(faq)
  });

  const text = await response.text();
  const data = text ? JSON.parse(text) : null;

  return { ok: response.ok, status: response.status, data };
}

async function run() {
  console.log(`Seeding demo FAQs against ${baseUrl}`);
  console.log("=".repeat(70));

  const results = [];

  for (const [brandId, faqs] of Object.entries(DEMO_FAQS)) {
    console.log(`\nBrand: ${brandId} (${faqs.length} FAQs)`);

    for (const faq of faqs) {
      const questionPreview = faq.question.length > 60 ? `${faq.question.slice(0, 60)}...` : faq.question;

      try {
        const result = await createFaq(brandId, faq);

        if (result.ok) {
          console.log(`  OK   [${result.status}] ${questionPreview}`);
        } else {
          console.log(`  FAIL [${result.status}] ${questionPreview}`);
          console.log(`       error: ${JSON.stringify(result.data)}`);
        }

        results.push({ brandId, question: faq.question, ok: result.ok, status: result.status });
      } catch (error) {
        console.log(`  FAIL [network] ${questionPreview}`);
        console.log(`       error: ${error.message}`);
        results.push({ brandId, question: faq.question, ok: false, status: null, error: error.message });
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
      .forEach((r) => {
        console.log(`  - [${r.brandId}] "${r.question}" (status: ${r.status ?? "network error"})`);
      });
    process.exitCode = 1;
  }
}

run().catch((error) => {
  console.error("[seed-demo-faqs] Unexpected failure:", error);
  process.exitCode = 1;
});
