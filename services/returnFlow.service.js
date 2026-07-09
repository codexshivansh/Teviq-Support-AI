const { isConfirmMessage, isDeclineMessage } = require("./confirmationDetector.service");

function buildReturnReasonPrompt() {
  return "Aapka order Delivered hai, return/exchange ke liye eligible hai. Kripya batayein — return ki wajah kya hai (jaise size issue, defective item, wrong product, etc.)?";
}

function buildReturnConfirmationPrompt(reason) {
  return `Samajh gaya — return ki wajah: "${reason}". Kya main yeh return request submit kar doon? Reply "haan" ya "nahi".`;
}

// Pure decision function: given the current return-flow context and the
// customer's message, decide what should happen next. Does no I/O itself —
// the caller (supportBrain.js) is responsible for persisting state and
// creating any records, based on the returned `action`.
function handleReturnFlowMessage({ context, message }) {
  const step = context?.step;

  if (step === "awaiting_reason") {
    const reason = String(message || "").trim();
    return {
      action: "ask_confirmation",
      nextContext: { ...context, reason, step: "awaiting_confirmation" },
      reply: buildReturnConfirmationPrompt(reason)
    };
  }

  if (step === "awaiting_confirmation") {
    const confirmed = isConfirmMessage(message);
    const declined = isDeclineMessage(message);

    if (confirmed && !declined) {
      return { action: "confirmed", nextContext: context, reply: null };
    }

    if (declined && !confirmed) {
      return {
        action: "declined",
        nextContext: {},
        reply: "Theek hai, maine yeh return cancel kar diya hai. Kisi aur cheez mein madad chahiye to bataiye."
      };
    }

    return {
      action: "ambiguous",
      nextContext: context,
      reply: 'Maaf kijiye, samajh nahi aaya. Kya aap return submit karna chahte hain? Reply "haan" ya "nahi".'
    };
  }

  // Unknown/unexpected step value — reset defensively rather than get stuck.
  return {
    action: "reset",
    nextContext: {},
    reply: "Kuch gadbad ho gayi, chaliye dobara shuru karte hain. Aap kya poochna chahte hain?"
  };
}

module.exports = {
  buildReturnReasonPrompt,
  buildReturnConfirmationPrompt,
  isConfirmMessage,
  isDeclineMessage,
  handleReturnFlowMessage
};
