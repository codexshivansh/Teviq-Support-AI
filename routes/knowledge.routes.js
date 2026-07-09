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
const { asyncHandler } = require("../middleware/asyncHandler");
const { requireBrandAccess } = require("../middleware/brandAccess.middleware");

const router = express.Router();

router.post(
  "/:brandId/upload",
  requireBrandAccess,
  knowledgeUpload.single("document"),
  asyncHandler(uploadKnowledgeDocument)
);
router.get("/:brandId/documents", requireBrandAccess, asyncHandler(listKnowledgeDocuments));
router.delete("/:brandId/documents/:documentId", requireBrandAccess, asyncHandler(deleteKnowledgeDocument));
router.get("/:brandId/policies", requireBrandAccess, asyncHandler(listPolicies));
router.post("/:brandId/policies", requireBrandAccess, asyncHandler(createPolicy));
router.put("/:brandId/policies/:policyId", requireBrandAccess, asyncHandler(updatePolicy));
router.delete("/:brandId/policies/:policyId", requireBrandAccess, asyncHandler(deletePolicy));
router.get("/:brandId/faqs", requireBrandAccess, asyncHandler(listFaqs));
router.post("/:brandId/faqs", requireBrandAccess, asyncHandler(createFaq));
router.put("/:brandId/faqs/:faqId", requireBrandAccess, asyncHandler(updateFaq));
router.delete("/:brandId/faqs/:faqId", requireBrandAccess, asyncHandler(deleteFaq));
router.post("/:brandId/retrieve", requireBrandAccess, asyncHandler(retrieveKnowledgeForDebug));

module.exports = router;
