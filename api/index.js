// Vercel serverless entrypoint for the Express application.
// If the app fails during module initialization, return JSON instead of
// Vercel's generic FUNCTION_INVOCATION_FAILED page so the real cause is visible.
let app;
try {
  app = require("../server");
} catch (error) {
  console.error("AI Content Factory server initialization failed:", error);
  app = (req, res) => {
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify({
      ok: false,
      error: "Server initialization failed",
      detail: error && error.message ? error.message : String(error)
    }));
  };
}
module.exports = app;
