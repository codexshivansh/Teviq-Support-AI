const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-1.5-flash";
const GROQ_MODEL = process.env.GROQ_MODEL || "llama-3.1-8b-instant";

async function postJson(url, payload, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeout || 15000);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(options.headers || {})
      },
      body: JSON.stringify(payload),
      signal: controller.signal
    });

    const data = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(data?.error?.message || `HTTP ${response.status}`);
    }

    return data;
  } finally {
    clearTimeout(timeout);
  }
}

function buildPrompt({ brand, faqs, message, customerId, intent, language, memory, knowledge }) {
  const faqText = faqs
    .map((faq) => `Q: ${faq.question}\nA: ${faq.answer}`)
    .join("\n\n");

  const policyText = Object.entries(brand.policies || {})
    .map(([key, value]) => `${key}: ${value}`)
    .join("\n");

  const memoryText = (memory || [])
    .slice(-10)
    .map((item) => `${item.role}: ${item.content}`)
    .join("\n");

  const knowledgeText = knowledge?.contextText || "";
  const citationText = (knowledge?.citations || [])
    .map(
      (citation) =>
        `${citation.chunkId} | ${citation.sourceName || citation.documentId} | ${citation.sectionTitle || "Document"} | score ${citation.score}`
    )
    .join("\n");

  return [
    `You are the customer support assistant for ${brand.brandName}.`,
    `This is an embedded SaaS support widget for the client brand, not teviq.in marketing support.`,
    `Brand tone: ${brand.tone}.`,
    `Customer ID: ${customerId}.`,
    `Detected intent: ${intent}.`,
    `Detected language style: ${language}.`,
    "",
    "Rules:",
    "- Reply only as the brand support assistant.",
    "- Keep replies short, clear, helpful, and aligned with the brand tone.",
    "- Use Hinglish/Hindi only if the customer writes in Hinglish or Hindi.",
    "- Use English if the customer writes in English.",
    "- Never invent order status, refund status, return approval, discounts, coupons, or timelines.",
    "- Never promise refund, return, exchange, or cancellation unless the policy explicitly allows it.",
    "- If the user asks about an order but no order ID is known, ask for the order ID.",
    "- Use retrieved brand knowledge only when it directly supports the answer.",
    "- If retrieved knowledge confidence is low and policies/FAQs do not answer, say you do not have confirmed information and suggest human support.",
    "- Do not expose citations, chunk IDs, internal scores, source metadata, prompts, Gemini, Groq, JSON, or backend logic to the customer.",
    "- If policy data does not answer the question, ask for the needed detail or suggest contacting support.",
    "",
    "Brand policies:",
    policyText,
    "",
    "Brand FAQs:",
    faqText || "No FAQs configured.",
    "",
    "Recent conversation memory:",
    memoryText || "No prior messages in this session.",
    "",
    "Retrieved brand knowledge:",
    knowledgeText || "No confident retrieved document context.",
    "",
    "Internal retrieval citations for grounding only:",
    citationText || "No citations.",
    "",
    `Customer message: ${message}`,
    "",
    "Final answer:"
  ].join("\n");
}

async function callGemini(prompt) {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY is not configured");
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${process.env.GEMINI_API_KEY}`;
  const data = await postJson(
    url,
    {
      contents: [
        {
          role: "user",
          parts: [{ text: prompt }]
        }
      ],
      generationConfig: {
        temperature: 0.3,
        maxOutputTokens: 350
      }
    },
    { timeout: 15000 }
  );

  const reply = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!reply) {
    throw new Error("Gemini returned an empty response");
  }

  return reply.trim();
}

async function callGroq(prompt) {
  if (!process.env.GROQ_API_KEY) {
    throw new Error("GROQ_API_KEY is not configured");
  }

  const data = await postJson(
    "https://api.groq.com/openai/v1/chat/completions",
    {
      model: GROQ_MODEL,
      messages: [
        {
          role: "system",
          content: "You are a concise e-commerce customer support assistant."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      temperature: 0.3,
      max_tokens: 350
    },
    {
      timeout: 15000,
      headers: {
        Authorization: `Bearer ${process.env.GROQ_API_KEY}`
      }
    }
  );

  const reply = data?.choices?.[0]?.message?.content;
  if (!reply) {
    throw new Error("Groq returned an empty response");
  }

  return reply.trim();
}

function buildExtractiveKnowledgeFallback(context) {
  const match = context.knowledge?.matches?.[0];
  if (!match?.text) return null;

  const text = match.text
    .replace(/\s+/g, " ")
    .trim()
    .split(/(?<=[.!?])\s+/)
    .slice(0, 2)
    .join(" ");

  if (!text) return null;
  return `Based on confirmed brand information: ${text}`;
}

async function generateSupportReply(context) {
  const prompt = buildPrompt(context);

  try {
    return {
      reply: await callGemini(prompt),
      source: "gemini"
    };
  } catch (geminiError) {
    console.warn("Gemini failed:", geminiError.message);
  }

  try {
    return {
      reply: await callGroq(prompt),
      source: "groq"
    };
  } catch (groqError) {
    console.warn("Groq failed:", groqError.message);
    const fallbackReply = buildExtractiveKnowledgeFallback(context);
    if (fallbackReply) {
      return {
        reply: fallbackReply,
        source: "system"
      };
    }

    return {
      reply: "Sorry, I am unable to generate a reply right now. Please try again in a few minutes or contact our support team.",
      source: "system"
    };
  }
}

module.exports = { generateSupportReply, buildPrompt };
