// Shared confirm/decline detection for any yes/no confirmation step in the
// conversation flow (return submission, order cancellation, etc.).
//
// Deliberately does NOT include "cancel" as a decline signal — that word is
// domain-overloaded (e.g. in the order-cancellation flow, "haan, cancel kar
// do" is a *confirmation*, not a decline). Relying only on unambiguous
// yes/no words avoids that class of conflict for any flow that reuses this.

function isConfirmMessage(message) {
  return /\b(haan|han|ha+|yes|yep|yup|confirm(ed)?|ok(ay)?|theek\s*hai|kar\s*do|proceed|submit)\b/i.test(
    String(message || "")
  );
}

function isDeclineMessage(message) {
  return /\b(nahi|nhi|na|no|nope|mat\s*karo|rehne\s*do|ruko|stop)\b/i.test(String(message || ""));
}

module.exports = { isConfirmMessage, isDeclineMessage };
