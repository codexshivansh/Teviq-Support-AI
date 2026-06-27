const express = require("express");
const {
  uploadKnowledgeDocument,
  listKnowledgeDocuments,
  deleteKnowledgeDocument,
  retrieveKnowledgeForDebug
} = require("../controllers/knowledge.controller");
const { knowledgeUpload } = require("../knowledge/upload.service");

const router = express.Router();

router.post("/:brandId/upload", knowledgeUpload.single("document"), uploadKnowledgeDocument);
router.get("/:brandId/documents", listKnowledgeDocuments);
router.delete("/:brandId/documents/:documentId", deleteKnowledgeDocument);
router.post("/:brandId/retrieve", retrieveKnowledgeForDebug);

module.exports = router;
