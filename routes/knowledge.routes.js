const express = require("express");
const {
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
} = require("../controllers/knowledge.controller");
const { knowledgeUpload } = require("../knowledge/upload.service");

const router = express.Router();

router.post("/:brandId/upload", knowledgeUpload.single("document"), uploadKnowledgeDocument);
router.get("/:brandId/documents", listKnowledgeDocuments);
router.delete("/:brandId/documents/:documentId", deleteKnowledgeDocument);
router.get("/:brandId/policies", listPolicies);
router.post("/:brandId/policies", createPolicy);
router.put("/:brandId/policies/:policyId", updatePolicy);
router.delete("/:brandId/policies/:policyId", deletePolicy);
router.get("/:brandId/faqs", listFaqs);
router.post("/:brandId/faqs", createFaq);
router.put("/:brandId/faqs/:faqId", updateFaq);
router.delete("/:brandId/faqs/:faqId", deleteFaq);
router.post("/:brandId/retrieve", retrieveKnowledgeForDebug);

module.exports = router;
