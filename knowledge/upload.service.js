const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const multer = require("multer");

const uploadRoot = path.join(__dirname, "..", "uploads", "knowledge");
const ALLOWED_EXTENSIONS = new Set([".pdf", ".docx", ".txt"]);
const ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain"
]);

function sanitizeBrandId(brandId) {
  if (!/^[a-z0-9-]+$/.test(String(brandId || ""))) {
    throw new Error("Invalid brandId for upload path.");
  }
  return brandId;
}

function ensureUploadDir(brandId) {
  const safeBrandId = sanitizeBrandId(brandId);
  const targetDir = path.join(uploadRoot, safeBrandId);
  fs.mkdirSync(targetDir, { recursive: true });
  return targetDir;
}

function createDocumentId() {
  return `doc_${Date.now()}_${crypto.randomBytes(6).toString("hex")}`;
}

function getExtension(fileName) {
  return path.extname(fileName || "").toLowerCase();
}

function validateUploadFile(file) {
  const extension = getExtension(file.originalname);
  const mimeAllowed = ALLOWED_MIME_TYPES.has(file.mimetype);
  const extensionAllowed = ALLOWED_EXTENSIONS.has(extension);

  if (!extensionAllowed || !mimeAllowed) {
    const error = new Error("Only PDF, DOCX and TXT documents are supported.");
    error.statusCode = 400;
    throw error;
  }
}

const storage = multer.diskStorage({
  destination(req, file, cb) {
    try {
      cb(null, ensureUploadDir(req.params.brandId));
    } catch (error) {
      cb(error);
    }
  },
  filename(req, file, cb) {
    const documentId = createDocumentId();
    req.teviqDocumentId = documentId;
    cb(null, `${documentId}${getExtension(file.originalname)}`);
  }
});

const knowledgeUpload = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024,
    files: 1
  },
  fileFilter(req, file, cb) {
    try {
      validateUploadFile(file);
      cb(null, true);
    } catch (error) {
      cb(error);
    }
  }
});

function buildUploadMetadata({ brandId, file, title }) {
  const uploadedAt = new Date().toISOString();
  return {
    brandId,
    documentId: path.basename(file.filename, path.extname(file.filename)),
    title: title || file.originalname,
    sourceName: file.originalname,
    storedFileName: file.filename,
    filePath: file.path,
    mimeType: file.mimetype,
    extension: getExtension(file.originalname).slice(1),
    sizeBytes: file.size,
    uploadedAt
  };
}

module.exports = {
  ALLOWED_EXTENSIONS,
  uploadRoot,
  knowledgeUpload,
  buildUploadMetadata,
  ensureUploadDir
};
