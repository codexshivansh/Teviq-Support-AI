const fs = require("fs/promises");
const { PDFParse } = require("pdf-parse");
const mammoth = require("mammoth");

// pdf-parse v2 switched from a default function `pdfParse(buffer)` to a
// class-based API `new PDFParse({ data }).getText()`. The old call shape
// was throwing "pdfParse is not a function" on upload.
async function extractTextFromPdf(filePath) {
  const buffer = await fs.readFile(filePath);
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

async function extractTextFromDocx(filePath) {
  const result = await mammoth.extractRawText({ path: filePath });
  return {
    text: result.value || "",
    warnings: result.messages || []
  };
}

async function extractTextFromTxt(filePath) {
  return {
    text: await fs.readFile(filePath, "utf8")
  };
}

async function extractText(uploadMetadata) {
  const extension = uploadMetadata.extension;

  if (extension === "pdf") {
    return extractTextFromPdf(uploadMetadata.filePath);
  }

  if (extension === "docx") {
    return extractTextFromDocx(uploadMetadata.filePath);
  }

  if (extension === "txt") {
    return extractTextFromTxt(uploadMetadata.filePath);
  }

  const error = new Error("Unsupported document type.");
  error.statusCode = 400;
  throw error;
}

module.exports = { extractText };
