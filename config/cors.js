const { getAllowedOrigins, isProduction } = require("./env");

function corsOrigin(origin, callback) {
  if (!isProduction()) {
    return callback(null, true);
  }

  const allowedOrigins = getAllowedOrigins();

  if (!origin) {
    return callback(null, true);
  }

  if (allowedOrigins.includes(origin)) {
    return callback(null, true);
  }

  return callback(new Error("Origin is not allowed by CORS"));
}

module.exports = { corsOrigin };
