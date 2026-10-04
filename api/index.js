// Explicit Vercel serverless entrypoint for the Express application.
// Keeping the adapter in /api removes ambiguity about which function handles
// POST /api/* requests while preserving the existing Express routes.
module.exports = require("../server");
