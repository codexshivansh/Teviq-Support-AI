const fs = require("fs");
const { getBrandById } = require("../services/brand.service");
const { buildUploadMetadata, uploadRoot } = require("../knowledge/upload.service");
const { ingestKnowledgeDocument } = require("../knowledge/knowledge.service");
const { retrieveKnowledge } = require("../knowledge/retrieval.service");
const vectorStore = require("../knowledge/vectorStore.service");
const structuredKnowledge = require("../knowledge/structuredKnowledge.service");

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

function listPolicies(req, res) {
  const brand = getBrandOrRespond(req, res);
  if (!brand) return;

  const policies = structuredKnowledge.listItems({
    brandId: brand.brandId,
    type: "policy",
    search: req.query?.search
  });

  return res.json({
    brandId: brand.brandId,
    policies,
    stats: structuredKnowledge.getStructuredStats(brand.brandId)
  });
}

function createPolicy(req, res) {
  const brand = getBrandOrRespond(req, res);
  if (!brand) return;

  const result = structuredKnowledge.createPolicy({
    brandId: brand.brandId,
    policyType: req.body?.policyType,
    title: req.body?.title,
    content: req.body?.content,
    tags: req.body?.tags
  });

  if (result.error) {
    return res.status(400).json(result.error);
  }

  return res.status(201).json({
    ok: true,
    brandId: brand.brandId,
    policy: result.item
  });
}

function updatePolicy(req, res) {
  const brand = getBrandOrRespond(req, res);
  if (!brand) return;

  const result = structuredKnowledge.updatePolicy({
    brandId: brand.brandId,
    policyId: req.params.policyId,
    updates: req.body || {}
  });

  if (result.error) {
    const status = result.error.error === "policy_not_found" ? 404 : 400;
    return res.status(status).json(result.error);
  }

  return res.json({
    ok: true,
    brandId: brand.brandId,
    policy: result.item
  });
}

function deletePolicy(req, res) {
  const brand = getBrandOrRespond(req, res);
  if (!brand) return;

  const result = structuredKnowledge.deleteItem({
    brandId: brand.brandId,
    itemId: req.params.policyId,
    type: "policy"
  });

  if (!result.deleted) {
    return res.status(404).json({
      error: "policy_not_found",
      message: "Policy not found for this brand."
    });
  }

  return res.json({
    ok: true,
    brandId: brand.brandId,
    policyId: req.params.policyId
  });
}

function listFaqs(req, res) {
  const brand = getBrandOrRespond(req, res);
  if (!brand) return;

  const faqs = structuredKnowledge.listItems({
    brandId: brand.brandId,
    type: "faq",
    search: req.query?.search
  });

  return res.json({
    brandId: brand.brandId,
    faqs,
    stats: structuredKnowledge.getStructuredStats(brand.brandId)
  });
}

function createFaq(req, res) {
  const brand = getBrandOrRespond(req, res);
  if (!brand) return;

  const result = structuredKnowledge.createFaq({
    brandId: brand.brandId,
    question: req.body?.question,
    answer: req.body?.answer,
    tags: req.body?.tags
  });

  if (result.error) {
    return res.status(400).json(result.error);
  }

  return res.status(201).json({
    ok: true,
    brandId: brand.brandId,
    faq: result.item
  });
}

function updateFaq(req, res) {
  const brand = getBrandOrRespond(req, res);
  if (!brand) return;

  const result = structuredKnowledge.updateFaq({
    brandId: brand.brandId,
    faqId: req.params.faqId,
    updates: req.body || {}
  });

  if (result.error) {
    const status = result.error.error === "faq_not_found" ? 404 : 400;
    return res.status(status).json(result.error);
  }

  return res.json({
    ok: true,
    brandId: brand.brandId,
    faq: result.item
  });
}

function deleteFaq(req, res) {
  const brand = getBrandOrRespond(req, res);
  if (!brand) return;

  const result = structuredKnowledge.deleteItem({
    brandId: brand.brandId,
    itemId: req.params.faqId,
    type: "faq"
  });

  if (!result.deleted) {
    return res.status(404).json({
      error: "faq_not_found",
      message: "FAQ not found for this brand."
    });
  }

  return res.json({
    ok: true,
    brandId: brand.brandId,
    faqId: req.params.faqId
  });
}

module.exports = {
  uploadKnowledgeDocument,
  listKnowledgeDocuments,
  deleteKnowledgeDocument,
  retrieveKnowledgeForDebug,
  listPolicies,
  createPolicy,
  updatePolicy,
  deletePolicy,
  listFaqs,
  createFaq,
  updateFaq,
  deleteFaq
};
