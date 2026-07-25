const fs = require("fs/promises");
const { PDFParse } = require("pdf-parse");
const mammoth = require("mammoth");

// pdf-parse v2 switched from a default function `pdfParse(buffer)` to a
// class-based API `new PDFParse({ data }).getText()`. The old call shape
// was throwing "pdfParse is not a function" on upload.
async function getDocumentBuffer(uploadMetadata) {
  if (Buffer.isBuffer(uploadMetadata.fileBuffer)) {
    return uploadMetadata.fileBuffer;
  }

  if (uploadMetadata.filePath) {
    return fs.readFile(uploadMetadata.filePath);
  }

  const error = new Error("Document bytes are unavailable for extraction.");
  error.statusCode = 400;
  throw error;
}

async function extractTextFromPdf(buffer) {
  const parser = new PDFParse({ data: buffer });
  try {
    const result = await parser.getText();
    return {
      text: result.text || "",
      pages: result.total || result.numpages || null
    };
  } finally {
    await parser.destroy().catch(() => {});
  }
}

async function extractTextFromDocx(buffer) {
  const result = await mammoth.extractRawText({ buffer });
  return {
    text: result.value || "",
    warnings: result.messages || []
  };
}

async function extractTextFromTxt(buffer) {
  return {
    text: buffer.toString("utf8")
  };
}

async function extractText(uploadMetadata) {
  const extension = uploadMetadata.extension;
  const buffer = await getDocumentBuffer(uploadMetadata);

  if (extension === "pdf") {
    return extractTextFromPdf(buffer);
  }

  if (extension === "docx") {
    return extractTextFromDocx(buffer);
  }

  if (extension === "txt") {
    return extractTextFromTxt(buffer);
  }

  const error = new Error("Unsupported document type.");
  error.statusCode = 400;
  throw error;
}

module.exports = { extractText };
