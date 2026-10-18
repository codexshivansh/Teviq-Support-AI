// Offline lexical retrieval: customer text never reaches an embedding API.
const STOPWORDS = new Set(('a an the is are am was were be been do does did can could will would should what when where how why who which you your i my me we our to for of in on at and or about with this that please tell know hai hain ho kya ka ki ke ko se mein aap mujhe mujhey').split(' '));

function normalizeText(value) {
  return String(value || '').normalize('NFKC').toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
}

function tokenize(value) {
  return normalizeText(value).split(' ').filter(word => word.length > 1 && !STOPWORDS.has(word));
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
    const exactFaq = Boolean(question && question === normalizedQuery);
    const phrase = normalizedQuery.length >= 4 && normalizeText(chunk.text).includes(normalizedQuery);
    let score = 0.45 * coverage + 0.4 * weightedCoverage + (phrase ? 0.1 : 0);
    if (terms.length === 1 && !exactFaq) score = Math.min(score, 0.6);
    if (exactFaq) score = 0.99;
    return { ...chunk, score: Math.min(score, 0.99), retrievalMode: 'lexical' };
  }).filter(Boolean).sort((a, b) => b.score - a.score || String(a.id).localeCompare(String(b.id))).slice(0, topK);
}

module.exports = { normalizeText, tokenize, rankChunks };
