const fs = require("fs");
const path = require("path");

const baseUrl = process.env.CHAT_TEST_URL || "http://localhost:5000";
const brandId = process.env.CHAT_TEST_BRAND || "vastra-demo";
const customerId = "journey_test_user";
const logFile = path.join(__dirname, "..", "logs", "chat-logs.json");

const QUERIES = [
  { label: "Exact FAQ match", message: "Sahi size kaise choose karu?" },
  { label: "Paraphrase, same intent", message: "Mujhe nahi pata kaunsa size lena chahiye, help karo" },
  { label: "Hinglish paraphrase (return)", message: "return kaise karu order" },
  { label: "Unrelated query", message: "Aapke paas laptop bags milte hain?" },
  { label: "Escalation trigger", message: "Mera order fraud hua hai, paisa wapas chahiye" }
];

async function sendChat(message) {
  const response = await fetch(`${baseUrl}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ brandId, message, customerId })
  });

  const data = await response.json().catch(() => null);
  return { status: response.status, data };
}

function getLastLogEntry() {
  try {
    const logs = JSON.parse(fs.readFileSync(logFile, "utf8"));
    return logs[logs.length - 1] || null;
  } catch (error) {
    return null;
  }
}

async function run() {
  console.log(`Chat journey test against ${baseUrl} (brandId=${brandId}, customerId=${customerId})`);
  console.log("=".repeat(90));

  const results = [];

  for (const query of QUERIES) {
    console.log(`\n--- ${query.label} ---`);
    console.log(`Message: "${query.message}"`);

    const { status, data } = await sendChat(query.message);
    const logEntry = getLastLogEntry();

    console.log(`HTTP status: ${status}`);
    console.log(`Reply: ${data?.reply}`);
    console.log(`Source: ${data?.source}`);
    console.log(`Intent: ${data?.intent}`);
    console.log(`Escalated: ${data?.escalated}`);
    console.log(`Confidence (from chat-logs.json): ${logEntry?.knowledgeConfidence ?? "n/a"}`);
    console.log(`Citations: ${JSON.stringify(logEntry?.knowledgeCitations || [])}`);

    results.push({
      label: query.label,
      message: query.message,
      status,
      reply: data?.reply,
      source: data?.source,
      intent: data?.intent,
      escalated: data?.escalated,
      confidence: logEntry?.knowledgeConfidence ?? "n/a",
      citations: logEntry?.knowledgeCitations || []
    });
  }

  console.log("\n" + "=".repeat(90));
  console.log("SUMMARY TABLE");
  console.log("=".repeat(90));

  results.forEach((r, index) => {
    console.log(`\n${index + 1}. ${r.label}`);
    console.log(`   Message:    ${r.message}`);
    console.log(`   Intent:     ${r.intent}`);
    console.log(`   Source:     ${r.source}`);
    console.log(`   Escalated:  ${r.escalated}`);
    console.log(`   Confidence: ${r.confidence}`);
    console.log(`   Reply:      ${r.reply}`);
  });
}

run().catch((error) => {
  console.error("[test-chat-journey] Failed:", error);
  process.exitCode = 1;
});
