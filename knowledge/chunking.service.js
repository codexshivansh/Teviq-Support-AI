const MAX_CHUNK_CHARS = 1100;
const MIN_CHUNK_CHARS = 120;
const OVERLAP_CHARS = 140;

function normalizeText(text) {
  return String(text || "")
    .replace(/\r/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function looksLikeHeading(line) {
  const value = line.trim();
  if (!value || value.length > 90) return false;
  if (/^#{1,6}\s+/.test(value)) return true;
  if (/^\d+(\.\d+)*[.)]\s+\S/.test(value)) return true;
  if (/^[A-Z][A-Za-z0-9 /&:,-]{2,}$/.test(value) && value.split(/\s+/).length <= 9) return true;
  return false;
}

function splitIntoSections(text) {
  const cleanText = normalizeText(text);
  if (!cleanText) return [];

  const lines = cleanText.split("\n");
  const sections = [];
  let current = {
    title: "Document",
    lines: []
  };

  lines.forEach((line) => {
    if (looksLikeHeading(line) && current.lines.join("\n").trim().length >= MIN_CHUNK_CHARS) {
      sections.push(current);
      current = {
        title: line.replace(/^#{1,6}\s+/, "").trim(),
        lines: []
      };
      return;
    }

    if (looksLikeHeading(line) && current.lines.length === 0) {
      current.title = line.replace(/^#{1,6}\s+/, "").trim();
      return;
    }

    current.lines.push(line);
  });

  if (current.lines.join("\n").trim()) {
    sections.push(current);
  }

  return sections.map((section) => ({
    title: section.title,
    text: section.lines.join("\n").trim()
  }));
}

function splitLongSection(sectionText) {
  const paragraphs = sectionText
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);

  const chunks = [];
  let current = "";

  paragraphs.forEach((paragraph) => {
    const candidate = [current, paragraph].filter(Boolean).join("\n\n");
    if (candidate.length <= MAX_CHUNK_CHARS) {
      current = candidate;
      return;
    }

    if (current) {
      chunks.push(current);
      current = current.slice(-OVERLAP_CHARS);
    }

    if (paragraph.length <= MAX_CHUNK_CHARS) {
      current = [current, paragraph].filter(Boolean).join("\n\n");
      return;
    }

    for (let index = 0; index < paragraph.length; index += MAX_CHUNK_CHARS - OVERLAP_CHARS) {
      chunks.push(paragraph.slice(index, index + MAX_CHUNK_CHARS).trim());
    }
    current = "";
  });

  if (current.trim()) {
    chunks.push(current.trim());
  }

  return chunks;
}

function chunkText(text, sourceMetadata) {
  const sections = splitIntoSections(text);
  const chunks = [];

  sections.forEach((section) => {
    splitLongSection(section.text).forEach((chunkTextValue) => {
      if (chunkTextValue.length < MIN_CHUNK_CHARS && chunks.length) {
        chunks[chunks.length - 1].text = `${chunks[chunks.length - 1].text}\n\n${chunkTextValue}`;
        return;
      }

      chunks.push({
        id: `${sourceMetadata.documentId}_chunk_${chunks.length + 1}`,
        brandId: sourceMetadata.brandId,
        documentId: sourceMetadata.documentId,
        text: chunkTextValue,
        metadata: {
          brandId: sourceMetadata.brandId,
          documentId: sourceMetadata.documentId,
          sourceName: sourceMetadata.sourceName,
          title: sourceMetadata.title,
          sectionTitle: section.title,
          chunkIndex: chunks.length,
          mimeType: sourceMetadata.mimeType,
          extension: sourceMetadata.extension,
          uploadedAt: sourceMetadata.uploadedAt
        }
      });
    });
  });

  return chunks;
}

module.exports = {
  chunkText,
  normalizeText,
  splitIntoSections
};
