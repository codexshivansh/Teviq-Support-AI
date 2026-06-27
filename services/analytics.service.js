const fs = require("fs");
const path = require("path");

const logsDir = path.join(__dirname, "..", "logs");
const logFile = path.join(logsDir, "chat-logs.json");

function ensureLogFile() {
  if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
  }

  if (!fs.existsSync(logFile)) {
    fs.writeFileSync(logFile, "[]\n");
  }
}

function appendChatLog(entry) {
  try {
    ensureLogFile();
    const logs = JSON.parse(fs.readFileSync(logFile, "utf8"));
    logs.push({
      timestamp: new Date().toISOString(),
      brandId: entry.brandId,
      customerId: entry.customerId,
      message: entry.message,
      detectedIntent: entry.detectedIntent,
      escalated: Boolean(entry.escalated),
      source: entry.source,
      reply: entry.reply,
      knowledgeConfidence: entry.knowledgeConfidence,
      knowledgeCitations: entry.knowledgeCitations || []
    });
    fs.writeFileSync(logFile, `${JSON.stringify(logs, null, 2)}\n`);
  } catch (error) {
    console.warn("Failed to write chat log:", error.message);
  }
}

module.exports = { appendChatLog };
