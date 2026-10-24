const fs = require("fs/promises");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");

const DEFAULT_BUCKET = "knowledge-documents";
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;
const ALLOWED_MIME_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain"
];

let client;
let clientOverride;
let bucketReadyPromise;

function getBucketName() {
  const bucket = String(process.env.SUPABASE_KNOWLEDGE_BUCKET || DEFAULT_BUCKET).trim();

  if (!/^[a-z0-9][a-z0-9._-]{1,62}$/i.test(bucket)) {
    const error = new Error("SUPABASE_KNOWLEDGE_BUCKET is invalid.");
    error.statusCode = 500;
    error.code = "knowledge_bucket_invalid";
    throw error;
  }

  return bucket;
}

function getStorageClient() {
  if (clientOverride) return clientOverride;
  if (client) return client;

  const url = String(process.env.SUPABASE_URL || "").replace(/\/$/, "");
  const serviceRoleKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY || "");

  if (!url || !serviceRoleKey) {
    const error = new Error("Supabase knowledge-file storage is not configured.");
    error.statusCode = 503;
    error.code = "knowledge_storage_not_configured";
    throw error;
  }

  client = createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false
    }
  });

  return client;
}

function isNotFoundError(error) {
  const status = Number(error?.statusCode || error?.status || 0);
  const message = String(error?.message || "").toLowerCase();
  return status === 404 || message.includes("not found");
}

function isAlreadyExistsError(error) {
  const status = Number(error?.statusCode || error?.status || 0);
  const message = String(error?.message || "").toLowerCase();
  return status === 409 || message.includes("already exists") || message.includes("duplicate");
}

function buildObjectPath({ brandId, storedFileName }) {
  const safeBrandId = String(brandId || "").trim().toLowerCase();
  const requestedFileName = String(storedFileName || "").trim();
  const safeFileName = path.basename(requestedFileName);

  if (!/^[a-z0-9-]+$/.test(safeBrandId)) {
    const error = new Error("Invalid brandId for knowledge storage.");
    error.statusCode = 400;
    error.code = "invalid_brand_id";
    throw error;
  }

  if (
    !safeFileName ||
    safeFileName !== requestedFileName ||
    !/^[a-zA-Z0-9._-]+$/.test(safeFileName)
  ) {
    const error = new Error("Invalid knowledge document filename.");
    error.statusCode = 400;
    error.code = "invalid_document_filename";
    throw error;
  }

  return `${safeBrandId}/${safeFileName}`;
}

async function ensurePrivateBucket() {
  if (bucketReadyPromise) return bucketReadyPromise;

  bucketReadyPromise = (async () => {
    const supabase = getStorageClient();
    const bucket = getBucketName();
    const { data, error } = await supabase.storage.getBucket(bucket);

    if (data && !error) {
      if (data.public !== false) {
        const privacyError = new Error(
          `Knowledge storage bucket "${bucket}" must be private.`
        );
        privacyError.statusCode = 503;
        privacyError.code = "knowledge_bucket_public";
        throw privacyError;
      }

      return data;
    }
    if (error && !isNotFoundError(error)) throw error;

    const createResult = await supabase.storage.createBucket(bucket, {
      allowedMimeTypes: ALLOWED_MIME_TYPES,
      fileSizeLimit: MAX_FILE_SIZE_BYTES,
      public: false
    });

    if (createResult.error && !isAlreadyExistsError(createResult.error)) {
      throw createResult.error;
    }

    return createResult.data || { id: bucket, name: bucket, public: false };
  })().catch((error) => {
    bucketReadyPromise = null;

    if (error.code === "knowledge_bucket_public") {
      throw error;
    }

    const wrapped = new Error(`Knowledge storage bucket is unavailable: ${error.message}`);
    wrapped.statusCode = Number(error?.statusCode || error?.status) || 503;
    wrapped.code = "knowledge_bucket_unavailable";
    throw wrapped;
  });

  return bucketReadyPromise;
}

async function getUploadBuffer(uploadMetadata) {
  if (Buffer.isBuffer(uploadMetadata.fileBuffer)) {
    return uploadMetadata.fileBuffer;
  }

  if (uploadMetadata.filePath) {
    return fs.readFile(uploadMetadata.filePath);
  }

  const error = new Error("Knowledge document bytes are unavailable.");
  error.statusCode = 400;
  error.code = "document_bytes_missing";
  throw error;
}

async function uploadDocument(uploadMetadata) {
  const mimeType = String(uploadMetadata.mimeType || "").trim().toLowerCase();

  if (!ALLOWED_MIME_TYPES.includes(mimeType)) {
    const error = new Error("Only PDF, DOCX, and TXT knowledge documents are supported.");
    error.statusCode = 400;
    error.code = "unsupported_document_type";
    throw error;
  }

  await ensurePrivateBucket();

  const supabase = getStorageClient();
  const bucket = getBucketName();
  const objectPath = buildObjectPath(uploadMetadata);
  const buffer = await getUploadBuffer(uploadMetadata);

  if (buffer.length > MAX_FILE_SIZE_BYTES) {
    const error = new Error("Knowledge document exceeds the 10 MB limit.");
    error.statusCode = 413;
    error.code = "document_too_large";
    throw error;
  }

  const { data, error } = await supabase.storage.from(bucket).upload(objectPath, buffer, {
    cacheControl: "3600",
    contentType: mimeType,
    upsert: false
  });

  if (error) {
    const wrapped = new Error(`Knowledge document storage failed: ${error.message}`);
    wrapped.statusCode = Number(error.statusCode || error.status) || 503;
    wrapped.code = "knowledge_storage_upload_failed";
    throw wrapped;
  }

  return {
    provider: "supabase",
    bucket,
    objectPath: data?.path || objectPath
  };
}

async function deleteDocument({ brandId, storedFileName }) {
  await ensurePrivateBucket();

  const supabase = getStorageClient();
  const bucket = getBucketName();
  const objectPath = buildObjectPath({ brandId, storedFileName });
  const { data, error } = await supabase.storage.from(bucket).remove([objectPath]);

  if (error && !isNotFoundError(error)) {
    const wrapped = new Error(`Knowledge document deletion failed: ${error.message}`);
    wrapped.statusCode = Number(error.statusCode || error.status) || 503;
    wrapped.code = "knowledge_storage_delete_failed";
    throw wrapped;
  }

  return {
    deleted: Array.isArray(data) ? data.length > 0 : !error,
    bucket,
    objectPath
  };
}

async function downloadDocument({ brandId, storedFileName }) {
  await ensurePrivateBucket();
  const { data, error } = await getStorageClient().storage.from(getBucketName()).download(buildObjectPath({ brandId, storedFileName }));
  if (error) throw error;
  return Buffer.from(await data.arrayBuffer());
}

function setStorageClientForTests(mockClient) {
  clientOverride = mockClient || null;
  bucketReadyPromise = null;
}

function resetStorageClientForTests() {
  clientOverride = null;
  client = null;
  bucketReadyPromise = null;
}

module.exports = {
  ALLOWED_MIME_TYPES,
  DEFAULT_BUCKET,
  MAX_FILE_SIZE_BYTES,
  buildObjectPath,
  deleteDocument,
  downloadDocument,
  ensurePrivateBucket,
  getBucketName,
  resetStorageClientForTests,
  setStorageClientForTests,
  uploadDocument
};
