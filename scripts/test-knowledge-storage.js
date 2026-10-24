const assert = require("assert");
const {
  buildObjectPath,
  deleteDocument,
  downloadDocument,
  resetStorageClientForTests,
  setStorageClientForTests,
  uploadDocument
} = require("../knowledge/knowledgeFileStorage.service");
const { extractText } = require("../knowledge/extraction.service");
const { buildUploadMetadata } = require("../knowledge/upload.service");
const vectorStore = require("../knowledge/vectorStore.service");

process.env.SUPABASE_URL = "https://test-project.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key";
process.env.SUPABASE_KNOWLEDGE_BUCKET = "knowledge-documents";

function createStorageMock({ existingBucket = null } = {}) {
  const calls = [];

  return {
    calls,
    client: {
      storage: {
        async getBucket(bucket) {
          calls.push({ action: "getBucket", bucket });
          if (existingBucket) {
            return {
              data: { id: bucket, name: bucket, ...existingBucket },
              error: null
            };
          }

          return {
            data: null,
            error: { statusCode: 404, message: "Bucket not found" }
          };
        },
        async createBucket(bucket, options) {
          calls.push({ action: "createBucket", bucket, options });
          return {
            data: { id: bucket, name: bucket, public: options.public },
            error: null
          };
        },
        from(bucket) {
          return {
            async download(objectPath) {
              calls.push({ action: "download", bucket, objectPath });
              return { data: new Blob(["Returns are accepted after delivery."]), error: null };
            },
            async upload(objectPath, buffer, options) {
              calls.push({
                action: "upload",
                bucket,
                objectPath,
                buffer,
                options
              });
              return { data: { path: objectPath }, error: null };
            },
            async remove(objectPaths) {
              calls.push({ action: "remove", bucket, objectPaths });
              return {
                data: objectPaths.map((name) => ({ name })),
                error: null
              };
            }
          };
        }
      }
    }
  };
}

function createFetchResponse(status, data) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async text() {
      return data == null ? "" : JSON.stringify(data);
    }
  };
}

async function captureVectorRollback(failureTarget) {
  const originalFetch = global.fetch;
  const calls = [];
  const failureMessage =
    failureTarget === "chunks"
      ? "Simulated chunk insert failure"
      : "Simulated document insert failure";

  global.fetch = async (url, options = {}) => {
    const value = String(url);
    calls.push({ url: value, method: options.method || "GET" });

    if (
      failureTarget === "chunks" &&
      value.includes("/knowledge_chunks") &&
      options.method === "POST"
    ) {
      return createFetchResponse(500, {
        message: failureMessage
      });
    }

    if (
      failureTarget === "document" &&
      value.includes("/knowledge_documents?on_conflict=") &&
      options.method === "POST"
    ) {
      return createFetchResponse(500, {
        message: failureMessage
      });
    }

    if (options.method === "DELETE") {
      return createFetchResponse(200, []);
    }

    return createFetchResponse(200, []);
  };

  try {
    await assert.rejects(
      () =>
        vectorStore.upsertDocument({
          document: {
            brandId: "urban-demo",
            documentId: "doc_rollback_test",
            title: "Rollback test",
            sourceName: "rollback.txt",
            storedFileName: "doc_rollback_test.txt",
            mimeType: "text/plain",
            extension: "txt",
            sizeBytes: 4,
            uploadedAt: new Date().toISOString(),
            chunkCount: 1,
            extraction: {}
          },
          chunks: [
            {
              id: "chunk_rollback_test",
              brandId: "urban-demo",
              documentId: "doc_rollback_test",
              text: "test",
              embedding: [0.1, 0.2],
              metadata: {
                source_id: "doc_rollback_test",
                source_type: "document"
              }
            }
          ]
        }),
      new RegExp(failureMessage)
    );

    const initialDocumentWrite = calls.find(
      (call) =>
        call.url.includes("/knowledge_documents?on_conflict=") &&
        call.method === "POST"
    );
    if (failureTarget === "chunks") {
      assert.strictEqual(
        initialDocumentWrite,
        undefined,
        "A failed chunk insert must not create a dashboard-visible document row."
      );
    } else {
      assert.ok(
        initialDocumentWrite,
        "The document-write failure scenario must reach the final metadata write."
      );
    }

    assert.ok(
      calls.some(
        (call) =>
          call.url.includes("/knowledge_chunks?brand_id=eq.urban-demo") &&
          call.method === "DELETE"
      ),
      "Rollback must attempt to remove document chunks."
    );
    assert.ok(
      calls.some(
        (call) =>
          call.url.includes("/knowledge_documents?brand_id=eq.urban-demo") &&
          call.method === "DELETE"
      ),
      "Rollback must attempt to remove document metadata."
    );

    return calls;
  } finally {
    global.fetch = originalFetch;
  }
}

async function verifyVectorRollback() {
  await captureVectorRollback("chunks");
  await captureVectorRollback("document");
}

async function run() {
  const storageMock = createStorageMock();
  setStorageClientForTests(storageMock.client);

  try {
    const file = {
      originalname: "returns-policy.txt",
      mimetype: "text/plain",
      size: 36,
      buffer: Buffer.from("Returns are accepted after delivery.")
    };
    const metadata = buildUploadMetadata({
      brandId: "urban-demo",
      file,
      title: "Returns policy"
    });

    assert.strictEqual(metadata.brandId, "urban-demo");
    assert.strictEqual(metadata.filePath, null);
    assert.ok(Buffer.isBuffer(metadata.fileBuffer));
    assert.match(metadata.storedFileName, /^doc_\d+_[a-f0-9]{12}\.txt$/);

    const extracted = await extractText(metadata);
    assert.strictEqual(extracted.text, "Returns are accepted after delivery.");

    const stored = await uploadDocument(metadata);
    assert.strictEqual(stored.provider, "supabase");
    assert.strictEqual(
      stored.objectPath,
      `urban-demo/${metadata.storedFileName}`
    );

    const createBucketCall = storageMock.calls.find(
      (call) => call.action === "createBucket"
    );
    assert.ok(createBucketCall, "Private bucket should be created when missing.");
    assert.strictEqual(createBucketCall.options.public, false);
    assert.strictEqual(createBucketCall.options.fileSizeLimit, 10 * 1024 * 1024);

    const uploadCall = storageMock.calls.find((call) => call.action === "upload");
    assert.ok(uploadCall, "Document should be uploaded.");
    assert.strictEqual(uploadCall.bucket, "knowledge-documents");
    assert.strictEqual(
      uploadCall.objectPath,
      `urban-demo/${metadata.storedFileName}`
    );
    assert.strictEqual(uploadCall.buffer.toString("utf8"), file.buffer.toString("utf8"));
    assert.strictEqual(uploadCall.options.contentType, "text/plain");
    assert.strictEqual(uploadCall.options.upsert, false);

    const downloaded = await downloadDocument({ brandId: "urban-demo", storedFileName: metadata.storedFileName });
    assert.strictEqual(downloaded.toString("utf8"), "Returns are accepted after delivery.");
    assert.strictEqual(storageMock.calls.find((call) => call.action === "download").objectPath, `urban-demo/${metadata.storedFileName}`);

    const deleted = await deleteDocument({
      brandId: "urban-demo",
      storedFileName: metadata.storedFileName
    });
    assert.strictEqual(deleted.deleted, true);

    const removeCall = storageMock.calls.find((call) => call.action === "remove");
    assert.deepStrictEqual(removeCall.objectPaths, [
      `urban-demo/${metadata.storedFileName}`
    ]);

    assert.throws(
      () =>
        buildObjectPath({
          brandId: "urban-demo",
          storedFileName: "../other-brand/private.txt"
        }),
      /Invalid knowledge document filename/
    );
    assert.throws(
      () =>
        buildObjectPath({
          brandId: "../urban-demo",
          storedFileName: "policy.txt"
      }),
      /Invalid brandId/
    );
    await assert.rejects(
      () =>
        uploadDocument({
          ...metadata,
          mimeType: "text/html"
        }),
      (error) =>
        error.code === "unsupported_document_type" &&
        error.statusCode === 400
    );

    const publicBucketMock = createStorageMock({
      existingBucket: { public: true }
    });
    setStorageClientForTests(publicBucketMock.client);
    await assert.rejects(
      () => uploadDocument(metadata),
      (error) =>
        error.code === "knowledge_bucket_public" &&
        error.statusCode === 503 &&
        error.message.includes("must be private")
    );
    assert.ok(
      !publicBucketMock.calls.some((call) => call.action === "upload"),
      "Uploads must stop when an existing bucket is public."
    );

    const privateBucketMock = createStorageMock({
      existingBucket: { public: false }
    });
    setStorageClientForTests(privateBucketMock.client);
    const privateBucketUpload = await uploadDocument(metadata);
    assert.strictEqual(privateBucketUpload.provider, "supabase");
    assert.ok(
      !privateBucketMock.calls.some((call) => call.action === "createBucket"),
      "An existing private bucket should be reused."
    );

    await verifyVectorRollback();

    console.log("PASS: knowledge uploads stay in a private Supabase bucket");
    console.log("PASS: existing public buckets fail closed before upload");
    console.log("PASS: existing private buckets are reused");
    console.log("PASS: object paths are scoped by brandId");
    console.log("PASS: in-memory TXT extraction works without local persistence");
    console.log("PASS: deletion uses the Supabase Storage API");
    console.log("PASS: failed chunk persistence leaves no visible document row");
    console.log("PASS: failed chunk and document writes attempt full database rollback");
    console.log("PASS: path traversal is rejected");
    console.log("PASS: unsupported MIME types are rejected by the storage service");
  } finally {
    resetStorageClientForTests();
  }
}

run().catch((error) => {
  console.error("Knowledge storage test failed:", error);
  process.exitCode = 1;
});
