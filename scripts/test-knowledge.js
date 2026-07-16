require("dotenv").config();

const fs = require("fs");
const os = require("os");
const path = require("path");
const { getBrandById } = require("../services/brand.service");
const { buildUploadMetadata } = require("../knowledge/upload.service");
const { ingestKnowledgeDocument } = require("../knowledge/knowledge.service");
const { retrieveKnowledge } = require("../knowledge/retrieval.service");
const vectorStore = require("../knowledge/vectorStore.service");

async function run() {
  const brandId = "urban-demo";
  const brand = await getBrandById(brandId);
  if (!brand) {
    throw new Error("urban-demo brand is required for this test.");
  }

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "teviq-knowledge-"));
  const filePath = path.join(tempDir, "urban-demo-warranty.txt");
  fs.writeFileSync(
    filePath,
    [
      "Warranty Policy",
      "",
      "Urban Gadgets Demo offers a 6 month warranty on charging cables, earbuds and power banks.",
      "Warranty does not cover physical damage, water damage, burnt ports, missing parts or accessories damaged by misuse.",
      "",
      "Charging Help",
      "",
      "For charging issues, try a different adapter and cable before raising a support request."
    ].join("\n")
  );

  const uploadMetadata = buildUploadMetadata({
    brandId,
    file: {
      originalname: "urban-demo-warranty.txt",
      filename: `knowledge_test_${Date.now()}.txt`,
      path: filePath,
      mimetype: "text/plain",
      size: fs.statSync(filePath).size
    },
    title: "Urban Warranty Test"
  });

  const ingestion = await ingestKnowledgeDocument(uploadMetadata);
  const retrieval = await retrieveKnowledge({
    brandId,
    query: "Which products have a six month warranty?",
    topK: 5
  });
  const ingestedDocumentRetrieved = retrieval.matches.some(
    (match) => match.documentId === ingestion.document.documentId
  );

  console.log(
    JSON.stringify(
      {
        ok: ingestedDocumentRetrieved,
        documentId: ingestion.document.documentId,
        chunkCount: ingestion.chunkCount,
        confidence: retrieval.confidence,
        citations: retrieval.citations
      },
      null,
      2
    )
  );

  await vectorStore.deleteDocument({
    brandId,
    documentId: ingestion.document.documentId
  });
  fs.rmSync(tempDir, { recursive: true, force: true });

  if (!ingestedDocumentRetrieved) {
    throw new Error("The uploaded document was indexed but was not returned by retrieval.");
  }
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
