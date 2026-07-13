const { createClerkClient } = require("@clerk/backend");

function getClerkClient() {
  if (!process.env.CLERK_SECRET_KEY) {
    const error = new Error("Clerk secret key is not configured.");
    error.statusCode = 503;
    error.code = "auth_not_configured";
    throw error;
  }

  return createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });
}

function getMetadataBrandId(metadata = {}) {
  return metadata.brandId || metadata.brand_id || metadata.workspaceBrandId || metadata.workspace_brand_id || "";
}

async function getUserPublicMetadata(userId) {
  const clerkClient = getClerkClient();
  const user = await clerkClient.users.getUser(userId);
  return user.publicMetadata || {};
}

async function setUserBrandId(userId, brandId) {
  const clerkClient = getClerkClient();
  const user = await clerkClient.users.getUser(userId);
  const publicMetadata = {
    ...(user.publicMetadata || {}),
    brandId
  };
  const updatedUser = await clerkClient.users.updateUserMetadata(userId, {
    publicMetadata
  });
  return updatedUser.publicMetadata || publicMetadata;
}

module.exports = {
  getClerkClient,
  getMetadataBrandId,
  getUserPublicMetadata,
  setUserBrandId
};
