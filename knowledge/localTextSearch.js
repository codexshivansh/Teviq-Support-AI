// Offline lexical retrieval: customer text never reaches an embedding API.
const STOPWORDS = new Set(('a an the is are am was were be been do does did can could will would should what when where how why who which you your i my me we our to for of in on at and or about with this that please tell know there get offer hai hain ho kya ka ki ke ko se mein aap mujhe mujhey kar sakta sakti sakte hoon hote hoti hota kitna kitne kaunsi kaun kab kabhi bhi aur kaise karein karoon milega milta lagta kya क्या है हैं हो का की के को से में मैं मुझे आप और कौन सी किस कितना कितने कैसे कर करें करता सकता सकती सकते हूं हूँ होता होती होते मिलेगा मिलता लगते लगता कब पर करने होगा अपने आप').split(' '));

// Conservative lexical equivalents, not translation or semantic embeddings.
// Never map negations, amounts or product identities into a generic topic.
const ALIASES = new Map();
for (const [canonical, variants] of Object.entries({
  trial: ['ट्रायल'], free: ['फ्री', 'मुफ्त', 'मुफ़्त'], limit: ['limits', 'लिमिट', 'सीमा'],
  day: ['days', 'din', 'दिन'], setup: ['सेटअप'], installation: ['install', 'installing', 'इंस्टालेशन', 'इंस्टॉलेशन'],
  time: ['समय'], whatsapp: ['व्हाट्सएप', 'व्हाट्सऐप'], instagram: ['इंस्टाग्राम'],
  language: ['languages', 'भाषा', 'भाषाएं', 'भाषाएँ'], support: ['supported', 'supports', 'सपोर्ट'],
  hindi: ['हिंदी', 'हिन्दी'], english: ['इंग्लिश', 'अंग्रेजी', 'अंग्रेज़ी'], reply: ['replies', 'जवाब'],
  conversation: ['conversations', 'chat', 'chats', 'बातचीत', 'चैट'], store: ['stores', 'stored', 'स्टोर'],
  delete: ['deleted', 'deletion', 'डिलीट'], automatically: ['automatic'],
  widget: ['विजेट'], color: ['colors', 'colour', 'colours', 'रंग'],
  change: ['edit', 'editable', 'customize', 'customization', 'बदल'], greeting: ['ग्रीटिंग'],
  plan: ['plans', 'प्लान'], month: ['monthly', 'महीने', 'महीना'], price: ['prices', 'pricing', 'cost', 'कीमत'],
  starter: ['स्टार्टर'], subscription: ['subscribe', 'subscribing', 'सब्सक्रिप्शन'],
  cancel: ['cancellation', 'cancellations', 'cancelling', 'कैंसल'], access: ['एक्सेस'],
  end: ['बंद'], refund: ['refunds', 'रिफंड'], paid: ['पेड'],
  channel: ['channels', 'messaging'], contact: ['संपर्क'], team: ['टीम'], number: ['नंबर']
})) for (const variant of variants) ALIASES.set(variant, canonical);

function normalizeText(value) {
  return String(value || '').normalize('NFKC').toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
}

function tokenize(value) {
  return normalizeText(value).replace(/अपने आप/g, 'automatically').split(' ')
    .filter(word => word.length > 1 && !STOPWORDS.has(word)).map(word => ALIASES.get(word) || word);
}

function rankChunks(chunks, query, topK) {
  const terms = [...new Set(tokenize(query))];
  const normalizedQuery = normalizeText(query);
  if (!terms.length) return [];
  const docs = chunks.map(chunk => ({ chunk, tokens: tokenize(chunk.text) }));
  const frequencies = new Map(terms.map(term => [term, docs.filter(doc => doc.tokens.includes(term)).length]));
  const weight = term => Math.log(1 + docs.length / (1 + frequencies.get(term)));
  const totalWeight = terms.reduce((sum, term) => sum + weight(term), 0);
  return docs.map(({ chunk, tokens }) => {
    const words = new Set(tokens);
    const hits = terms.filter(term => words.has(term));
    if (!hits.length) return null;
    const coverage = hits.length / terms.length;
    const weightedCoverage = hits.reduce((sum, term) => sum + weight(term), 0) / totalWeight;
    const question = normalizeText(chunk.metadata?.question);
    const questionTerms = [...new Set(tokenize(question))];
    const equivalentQuestion = questionTerms.length > 0 && questionTerms.length === terms.length && questionTerms.every(term => terms.includes(term));
    const exactFaq = Boolean(question && (question === normalizedQuery || equivalentQuestion));
    const phrase = normalizedQuery.length >= 4 && normalizeText(chunk.text).includes(normalizedQuery);
    let score = 0.45 * coverage + 0.4 * weightedCoverage + (phrase ? 0.1 : 0);
    if (terms.length === 1 && !exactFaq) score = Math.min(score, 0.6);
    if (exactFaq) score = 0.99;
    return { ...chunk, score: Math.min(score, 0.99), retrievalMode: 'lexical' };
  }).filter(Boolean).sort((a, b) => b.score - a.score || String(a.id).localeCompare(String(b.id))).slice(0, topK);
}

module.exports = { normalizeText, tokenize, rankChunks };
