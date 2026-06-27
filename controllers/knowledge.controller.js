const fs = require("fs");
const { getBrandById } = require("../services/brand.service");
const { buildUploadMetadata, uploadRoot } = require("../knowledge/upload.service");
const { ingestKnowledgeDocument } = require("../knowledge/knowledge.service");
const { retrieveKnowledge } = require("../knowledge/retrieval.service");
const vectorStore = require("../knowledge/vectorStore.service");

function getBrandOrRespond(req, res) {
  const { brandId } = req.params;
  const brand = getBrandById(brandId);

  if (!brand) {
    res.status(404).json({
      error: "brand_not_found",
      message: "Brand not found."
    });
    return null;
  }

  return brand;
}

async function uploadKnowledgeDocument(req, res, next) {
  try {
    const brand = getBrandOrRespond(req, res);
    if (!brand) return;

    if (!req.file) {
      return res.status(400).json({
        error: "missing_document",
        message: "Upload a PDF, DOCX or TXT file using the document field."
      });
    }

    const uploadMetadata = buildUploadMetadata({
      brandId: brand.brandId,
      file: req.file,
      title: req.body?.title
    });

    const result = await ingestKnowledgeDocument(uploadMetadata);

    return res.status(201).json({
      ok: true,
      brandId: brand.brandId,
      document: result.document,
      chunkCount: result.chunkCount
    });
  } catch (error) {
    if (req.file?.path) {
      fs.rm(req.file.path, { force: true }, () => {});
    }
    next(error);
  }
}

function listKnowledgeDocuments(req, res) {
  const brand = getBrandOrRespond(req, res);
  if (!brand) return;

  return res.json({
    brandId: brand.brandId,
    documents: vectorStore.listDocuments(brand.brandId),
    stats: vectorStore.getStats(brand.brandId)
  });
}

function deleteKnowledgeDocument(req, res) {
  const brand = getBrandOrRespond(req, res);
  if (!brand) return;

  const document = vectorStore
    .listDocuments(brand.brandId)
    .find((item) => item.documentId === req.params.documentId);
  const result = vectorStore.deleteDocument({
    brandId: brand.brandId,
    documentId: req.params.documentId
  });

  if (!result.deleted) {
    return res.status(404).json({
      error: "document_not_found",
      message: "Document not found for this brand."
    });
  }

  if (document?.storedFileName) {
    const filePath = `${uploadRoot}/${brand.brandId}/${document.storedFileName}`;
    fs.rm(filePath, { force: true }, () => {});
  }

  return res.json({
    ok: true,
    brandId: brand.brandId,
    documentId: req.params.documentId,
    deletedChunks: result.deletedChunks
  });
}

function retrieveKnowledgeForDebug(req, res) {
  const brand = getBrandOrRespond(req, res);
  if (!brand) return;

  const query = String(req.body?.query || "").trim();
  if (!query) {
    return res.status(400).json({
      error: "missing_query",
      message: "query is required."
    });
  }

  const result = retrieveKnowledge({
    brandId: brand.brandId,
    query,
    topK: Number(req.body?.topK) || 5
  });

  return res.json({
    brandId: brand.brandId,
    query,
    confidence: result.confidence,
    confidenceLabel: result.confidenceLabel,
    lowConfidence: result.lowConfidence,
    citations: result.citations,
    matches: result.matches.map((match) => ({
      chunkId: match.id,
      documentId: match.documentId,
      score: Number(match.score.toFixed(4)),
      text: match.text,
      metadata: match.metadata
    }))
  });
}

module.exports = {
  uploadKnowledgeDocument,
  listKnowledgeDocuments,
  deleteKnowledgeDocument,
  retrieveKnowledgeForDebug
};
