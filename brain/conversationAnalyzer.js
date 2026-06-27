function detectLanguage(message) {
  if (/[ऀ-ॿ]/.test(message)) return "hindi";

  if (
    /\b(kya|hai|hain|kaise|kab|kitna|mera|meri|mujhe|chahiye|nahi|nahin|paise|wapas|jaldi|madad)\b/i.test(
      message
    )
  ) {
    return "hinglish";
  }

  return "english";
}

function detectSentiment(message) {
  const text = message.toLowerCase();

  if (/\b(thanks|thank you|great|awesome|love|happy|nice)\b/i.test(text)) {
    return "happy";
  }

  if (/\b(urgent|asap|immediately|right now|jaldi|emergency)\b/i.test(text)) {
    return "urgent";
  }

  if (/\b(confused|not sure|don't understand|samajh|kaise|how do i)\b/i.test(text)) {
    return "confused";
  }

  if (/\b(angry|terrible|worst|fraud|scam|cheat|hate|useless|police|legal)\b/i.test(text)) {
    return "angry";
  }

  return "neutral";
}

function detectMessageType(message) {
  const text = message.toLowerCase();

  if (/\b(viagra|casino|lottery|crypto pump|free money)\b/i.test(text)) {
    return "spam";
  }

  if (/\b(complaint|complain|fraud|scam|legal|police|not satisfied|angry)\b/i.test(text)) {
    return "complaint";
  }

  if (/\b(bulk|wholesale|collab|collaboration|partnership|business enquiry|business inquiry|price|recommend|suggest|buy)\b/i.test(text)) {
    return "sales";
  }

  if (/\b(order|return|exchange|refund|cancel|shipping|delivery|size|cod|payment|help|support|warranty)\b/i.test(text)) {
    return "support";
  }

  return "unknown";
}

function analyzeConversation(message) {
  return {
    language: detectLanguage(message),
    sentiment: detectSentiment(message),
    messageType: detectMessageType(message)
  };
}

module.exports = { analyzeConversation, detectLanguage, detectSentiment, detectMessageType };
