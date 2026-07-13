const SOURCE_DEFINITIONS = [
  {
    id: "shopify",
    label: "Shopify policy",
    pattern: /\bshopify(?:'s)?(?: (?:return|refund|exchange|shipping) policy)?\b/i
  },
  {
    id: "uploaded_policy",
    label: "uploaded policy",
    pattern: /\buploaded (?:pdfs?|documents?|files?|polic(?:y|ies))\b/i
  },
  {
    id: "dashboard_policy",
    label: "dashboard policy",
    pattern: /\b(?:dashboard|structured) policy\b/i
  },
  {
    id: "website_policy",
    label: "website policy",
    pattern: /\b(?:website|storefront|store) policy\b/i
  },
  {
    id: "faq",
    label: "FAQ",
    pattern: /\bfaq(?:s)?\b/i
  },
  {
    id: "knowledge_document",
    label: "knowledge document",
    pattern: /\bknowledge (?:base|document|source)\b/i
  }
];

const CONFLICT_SIGNAL =
  /\b(?:conflict(?:ing)?|contradict(?:ory|ion|ing)?|different|disagree(?:ment)?|mismatch|which (?:source|policy)|what (?:source|policy)|kis source|konsi policy|kaunsi policy)\b/i;

const NEGATED_PRECEDENCE =
  /\b(?:do(?:es)? not|doesn't|don't|is not|isn't|should not|shouldn't|must not|mustn't|will not|won't|cannot|can't|never|no)\b.{0,45}\b(?:take precedence|have priority|be followed|be used|override|win|authoritative|source of truth|follow|use|prioriti[sz]e|prefer)\b/i;

function getMentionedSources(text) {
  return SOURCE_DEFINITIONS.filter(({ pattern }) => pattern.test(text));
}

function isPolicySourceConflictQuery(message) {
  const text = String(message || "");
  const mentionsMultipleDocuments =
    /\b(?:two|multiple|different) uploaded (?:pdfs?|documents?|files?|policies)\b/i.test(text);
  const sources = getMentionedSources(text);

  return CONFLICT_SIGNAL.test(text) && (sources.length >= 2 || mentionsMultipleDocuments);
}

function getTextSegments(text) {
  return String(text || "")
    .split(/(?:[.!?]\s+|\n+)/)
    .map((segment) => segment.trim())
    .filter(Boolean);
}

function findPrecedenceSourceInSegment(segment) {
  if (NEGATED_PRECEDENCE.test(segment)) return null;

  const hasConflictContext = CONFLICT_SIGNAL.test(segment);
  const hasAbsoluteInstruction = /\b(?:always|authoritative|priority|source of truth)\b/i.test(segment);
  const hasDirectPriorityInstruction =
    /^(?:a:\s*)?(?:always\s+)?(?:follow|prioriti[sz]e|prefer)\b/i.test(segment);

  for (const source of SOURCE_DEFINITIONS) {
    const sourcePattern = source.pattern.source;
    const sourceBeforeAuthority = new RegExp(
      `${sourcePattern}.{0,55}(?:takes? precedence|has priority|is (?:the )?authoritative source|is (?:the )?source of truth|should be followed|must be followed|wins?|overrides?)`,
      "i"
    );
    const actionBeforeSource = new RegExp(
      `(?:follow(?:s|ed|ing)?|use(?:s|d|ing)?|prioriti[sz]e(?:s|d|ing)?|prefer(?:s|red|ring)?|rely(?:ing|ies|ied)? on)(?: (?:the|this))?.{0,20}${sourcePattern}`,
      "i"
    );
    const conflictGuidanceBeforeSource = new RegExp(
      `(?:answer|respond|guide)(?:s|d|ed|ing)?.{0,45}(?:based on|according to)(?: (?:the|this))?.{0,20}${sourcePattern}`,
      "i"
    );
    const authorityBeforeSource = new RegExp(
      `(?:authoritative source|source of truth|priority source)(?: is|:)?(?: (?:the|this))?.{0,20}${sourcePattern}`,
      "i"
    );
    const overriddenBySource = new RegExp(
      `(?:is|are) overridden by(?: (?:the|this))?.{0,20}${sourcePattern}`,
      "i"
    );

    if (
      sourceBeforeAuthority.test(segment) ||
      ((hasConflictContext || hasAbsoluteInstruction || hasDirectPriorityInstruction) &&
        actionBeforeSource.test(segment)) ||
      (hasConflictContext && conflictGuidanceBeforeSource.test(segment)) ||
      authorityBeforeSource.test(segment) ||
      overriddenBySource.test(segment)
    ) {
      return source;
    }
  }

  return null;
}

function findPrecedenceSource(text) {
  for (const segment of getTextSegments(text)) {
    const source = findPrecedenceSourceInSegment(segment);
    if (source) return source;
  }

  return null;
}

function containsSourcePrecedenceClaim(text) {
  return Boolean(findPrecedenceSource(text));
}

function findConfirmedPrecedence(knowledge) {
  for (const match of knowledge?.matches || []) {
    const text = String(match.text || "");
    const source = findPrecedenceSource(text);
    if (!source) continue;

    return {
      configured: true,
      authoritativeSource: source.id,
      authoritativeSourceLabel: source.label,
      evidenceChunkId: match.id || null,
      evidenceSourceId:
        match.metadata?.source_id ||
        match.metadata?.sourceId ||
        match.documentId ||
        null
    };
  }

  return {
    configured: false,
    authoritativeSource: null,
    authoritativeSourceLabel: null,
    evidenceChunkId: null,
    evidenceSourceId: null
  };
}

function buildUnconfiguredConflictReply(language = "english") {
  if (language === "english") {
    return "No confirmed source-precedence rule is configured for these conflicting policies, so I cannot safely choose one. I am escalating this for clarification.";
  }

  return "In conflicting policies ke liye koi confirmed source-precedence rule configured nahi hai, isliye main safely kisi ek ko choose nahi kar sakta. Main clarification ke liye ise support team ko escalate kar raha hoon.";
}

function evaluatePolicySourceConflict({ message, knowledge, language = "english" }) {
  const isConflict = isPolicySourceConflictQuery(message);
  const precedence = isConflict ? findConfirmedPrecedence(knowledge) : findConfirmedPrecedence(null);

  return {
    isConflict,
    ...precedence,
    safeReply: isConflict && !precedence.configured ? buildUnconfiguredConflictReply(language) : null
  };
}

module.exports = {
  buildUnconfiguredConflictReply,
  containsSourcePrecedenceClaim,
  evaluatePolicySourceConflict,
  findConfirmedPrecedence,
  isPolicySourceConflictQuery
};
