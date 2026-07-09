const crypto = require("crypto");

function getCredentialSecret() {
  const secret = process.env.SHOPIFY_CREDENTIALS_SECRET || process.env.CLERK_SECRET_KEY || "";
  if (!secret) {
    const error = new Error("Shopify credential encryption is not configured.");
    error.statusCode = 503;
    error.code = "credential_storage_not_configured";
    throw error;
  }
  return crypto.createHash("sha256").update(secret).digest();
}

function encryptValue(value) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", getCredentialSecret(), iv);
  const encrypted = Buffer.concat([cipher.update(String(value), "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return {
    algorithm: "aes-256-gcm",
    iv: iv.toString("base64"),
    authTag: authTag.toString("base64"),
    value: encrypted.toString("base64")
  };
}

function decryptValue(encrypted) {
  const payload = typeof encrypted === "string" ? JSON.parse(encrypted) : encrypted;
  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    getCredentialSecret(),
    Buffer.from(payload.iv, "base64")
  );
  decipher.setAuthTag(Buffer.from(payload.authTag, "base64"));

  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(payload.value, "base64")),
    decipher.final()
  ]);

  return decrypted.toString("utf8");
}

module.exports = { getCredentialSecret, encryptValue, decryptValue };
