const fs = require("fs");
const { buildUploadMetadata, uploadRoot } = require("../knowledge/upload.service");
const { ingestKnowledgeDocument } = require("../knowledge/knowledge.service");
const { extractText } = require("../knowledge/extraction.service");
const { retrieveKnowledge } = require("../knowledge/retrieval.service");
const vectorStore = require("../knowledge/vectorStore.service");
const knowledgeFileStorage = require("../knowledge/knowledgeFileStorage.service");
const structuredKnowledge = require("../knowledge/structuredKnowledge.service");
const { getBrandOrRespond } = require("./helpers/brandLookup");

async function uploadKnowledgeDocument(req, res, next) {
  try {
    const brand = await getBrandOrRespond(req, res);
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

async function listKnowledgeDocuments(req, res, next) {
  try {
    const brand = await getBrandOrRespond(req, res);
    if (!brand) return;

    const [documents, stats] = await Promise.all([
      vectorStore.listDocuments(brand.brandId),
      vectorStore.getStats(brand.brandId)
    ]);

    return res.json({
      brandId: brand.brandId,
      documents: documents || [],
      stats: stats || { documentCount: 0, chunkCount: 0 }
    });
  } catch (error) {
    // Pass to error handler with context
    error.context = "listKnowledgeDocuments";
    next(error);
  }
}

async function getKnowledgeDocumentText(req, res) {
  const brand = await getBrandOrRespond(req, res);
  if (!brand) return;
  const documents = await vectorStore.listDocuments(brand.brandId);
  const document = documents.find((item) => item.documentId === req.params.documentId);
  if (!document) return res.status(404).json({ message: "Document not found." });
  const content = document.extraction?.editableText;
  if (typeof content === "string") return res.json({ document, content });
  if (document.storedFileName) {
    try {
      const fileBuffer = await knowledgeFileStorage.downloadDocument({ brandId: brand.brandId, storedFileName: document.storedFileName });
      const extracted = await extractText({ extension: document.extension, fileBuffer });
      if (extracted.text?.trim()) return res.json({ document, content: extracted.text });
    } catch (error) {
      console.warn("[knowledge] Original document unavailable; opening indexed text instead:", error.message);
    }
  }
  const chunks = await vectorStore.listDocumentChunks({ brandId: brand.brandId, documentId: document.documentId });
  let reconstructed = "";
  for (const chunk of chunks) {
    const value = chunk.text;
    const maxOverlap = Math.min(reconstructed.length, value.length, 2000);
    let overlap = 0;
    for (let size = maxOverlap; size > 20; size -= 1) {
      if (reconstructed.endsWith(value.slice(0, size))) { overlap = size; break; }
    }
    reconstructed += `${reconstructed && !overlap ? "\n\n" : ""}${value.slice(overlap)}`;
  }
  return res.json({ document, content: reconstructed });
}

async function saveTextDocument(req, res) {
  const brand = await getBrandOrRespond(req, res);
  if (!brand) return;
  const title = String(req.body?.title || "").trim();
  const content = String(req.body?.content || "").trim();
  if (!title || title.length > 160 || content.length < 20 || content.length > 100000) {
    return res.status(400).json({ message: "Add a title and 20 to 100,000 characters of text." });
  }
  let previous = null;
  if (req.params.documentId) {
    const documents = await vectorStore.listDocuments(brand.brandId);
    previous = documents.find((item) => item.documentId === req.params.documentId);
    if (!previous) return res.status(404).json({ message: "Document not found." });
  }
  const buffer = Buffer.from(content, "utf8");
  const metadata = buildUploadMetadata({
    brandId: brand.brandId,
    title,
    file: { originalname: `${title.replace(/[^a-z0-9-]+/gi, "-").slice(0, 80) || "knowledge"}.txt`, buffer, size: buffer.length, mimetype: "text/plain" }
  });
  const result = await ingestKnowledgeDocument(metadata);
  if (previous) {
    try {
      await vectorStore.deleteDocument({ brandId: brand.brandId, documentId: previous.documentId });
    } catch (error) {
      await Promise.allSettled([
        vectorStore.deleteDocument({ brandId: brand.brandId, documentId: result.document.documentId }),
        knowledgeFileStorage.deleteDocument({ brandId: brand.brandId, storedFileName: result.document.storedFileName })
      ]);
      throw error;
    }
    if (previous.storedFileName) {
      await knowledgeFileStorage.deleteDocument({ brandId: brand.brandId, storedFileName: previous.storedFileName }).catch((error) => {
        console.warn("[knowledge] Old file cleanup deferred:", error.message);
      });
    }
  }
  return res.status(previous ? 200 : 201).json({ document: result.document, chunkCount: result.chunkCount });
}

async function deleteKnowledgeDocument(req, res, next) {
  try {
    const brand = await getBrandOrRespond(req, res);
    if (!brand) return;

    const documents = await vectorStore.listDocuments(brand.brandId);
    const document = documents.find((item) => item.documentId === req.params.documentId);

    if (!document) {
      return res.status(404).json({
        error: "document_not_found",
        message: "Document not found for this brand."
      });
    }

    if (document.storedFileName) {
      await knowledgeFileStorage.deleteDocument({
        brandId: brand.brandId,
        storedFileName: document.storedFileName
      });
    }

    const result = await vectorStore.deleteDocument({
      brandId: brand.brandId,
      documentId: req.params.documentId
    });

    if (document.storedFileName) {
      const filePath = `${uploadRoot}/${brand.brandId}/${document.storedFileName}`;
      fs.rm(filePath, { force: true }, () => {});
    }

    return res.json({
      ok: true,
      brandId: brand.brandId,
      documentId: req.params.documentId,
      deletedChunks: result.deletedChunks
    });
  } catch (error) {
    error.context = "deleteKnowledgeDocument";
    next(error);
  }
}

async function retrieveKnowledgeForDebug(req, res) {
  const brand = await getBrandOrRespond(req, res);
  if (!brand) return;

  const query = String(req.body?.query || "").trim();
  if (!query) {
    return res.status(400).json({
      error: "missing_query",
      message: "query is required."
    });
  }

  const result = await retrieveKnowledge({
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
      sourceId: match.metadata?.source_id || match.metadata?.sourceId || match.documentId,
      sourceType: match.metadata?.source_type || match.metadata?.sourceType || "document",
      score: Number(match.score.toFixed(4)),
      text: match.text,
      metadata: match.metadata
    }))
  });
}

async function listPolicies(req, res) {
  const brand = await getBrandOrRespond(req, res);
  if (!brand) return;

  const policies = await structuredKnowledge.listItems({
    brandId: brand.brandId,
    type: "policy",
    search: req.query?.search
  });

  return res.json({
    brandId: brand.brandId,
    policies,
    stats: await structuredKnowledge.getStructuredStats(brand.brandId)
  });
}

async function createPolicy(req, res) {
  const brand = await getBrandOrRespond(req, res);
  if (!brand) return;

  const result = await structuredKnowledge.createPolicy({
    brandId: brand.brandId,
    policyType: req.body?.policyType,
    title: req.body?.title,
    content: req.body?.content,
    tags: req.body?.tags
  });

  if (result.error) {
    const status = result.error.error === "indexing_failed" ? 500 : 400;
    return res.status(status).json(result.error);
  }

  return res.status(201).json({
    ok: true,
    brandId: brand.brandId,
    policy: result.item
  });
}

async function updatePolicy(req, res) {
  const brand = await getBrandOrRespond(req, res);
  if (!brand) return;

  const result = await structuredKnowledge.updatePolicy({
    brandId: brand.brandId,
    policyId: req.params.policyId,
    updates: req.body || {}
  });

  if (result.error) {
    const status =
      result.error.error === "policy_not_found"
        ? 404
        : ["indexing_failed", "save_failed"].includes(result.error.error)
          ? 500
          : 400;
    return res.status(status).json(result.error);
  }

  return res.json({
    ok: true,
    brandId: brand.brandId,
    policy: result.item
  });
}

async function deletePolicy(req, res) {
  const brand = await getBrandOrRespond(req, res);
  if (!brand) return;

  const result = await structuredKnowledge.deleteItem({
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
    policyId: req.params.policyId,
    deletedChunks: result.deletedChunks || 0
  });
}

async function listFaqs(req, res) {
  const brand = await getBrandOrRespond(req, res);
  if (!brand) return;

  const faqs = await structuredKnowledge.listItems({
    brandId: brand.brandId,
    type: "faq",
    search: req.query?.search
  });

  return res.json({
    brandId: brand.brandId,
    faqs,
    stats: await structuredKnowledge.getStructuredStats(brand.brandId)
  });
}

async function createFaq(req, res) {
  const brand = await getBrandOrRespond(req, res);
  if (!brand) return;

  const result = await structuredKnowledge.createFaq({
    brandId: brand.brandId,
    question: req.body?.question,
    answer: req.body?.answer,
    tags: req.body?.tags
  });

  if (result.error) {
    const status = result.error.error === "indexing_failed" ? 500 : 400;
    return res.status(status).json(result.error);
  }

  return res.status(201).json({
    ok: true,
    brandId: brand.brandId,
    faq: result.item
  });
}

async function updateFaq(req, res) {
  const brand = await getBrandOrRespond(req, res);
  if (!brand) return;

  const result = await structuredKnowledge.updateFaq({
    brandId: brand.brandId,
    faqId: req.params.faqId,
    updates: req.body || {}
  });

  if (result.error) {
    const status =
      result.error.error === "faq_not_found"
        ? 404
        : ["indexing_failed", "save_failed"].includes(result.error.error)
          ? 500
          : 400;
    return res.status(status).json(result.error);
  }

  return res.json({
    ok: true,
    brandId: brand.brandId,
    faq: result.item
  });
}

async function deleteFaq(req, res) {
  const brand = await getBrandOrRespond(req, res);
  if (!brand) return;

  const result = await structuredKnowledge.deleteItem({
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
    faqId: req.params.faqId,
    deletedChunks: result.deletedChunks || 0
  });
}

module.exports = {
  uploadKnowledgeDocument,
  listKnowledgeDocuments,
  getKnowledgeDocumentText,
  saveTextDocument,
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
