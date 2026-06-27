const fs = require("fs/promises");
const pdfParse = require("pdf-parse");
const mammoth = require("mammoth");

async function extractTextFromPdf(filePath) {
  const buffer = await fs.readFile(filePath);
  const result = await pdfParse(buffer);
  return {
    text: result.text || "",
    pages: result.numpages || null
  };
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
