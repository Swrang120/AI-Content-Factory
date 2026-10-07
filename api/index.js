// Vercel serverless entrypoint for the Express application.
let app;
let researchHub;
try {
  app = require("../server");
  researchHub = require("./research-hub");
} catch (error) {
  console.error("AI Content Factory server initialization failed:", error);
  app = null;
  researchHub = null;
}

module.exports = async (req, res) => {
  try {
    if (researchHub) {
      const handled = await researchHub.handler(req, res);
      if (handled !== null) return;
    }
    if (app) return app(req, res);
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify({
      ok: false,
      error: "Server initialization failed"
    }));
  } catch (error) {
    console.error("AI Content Factory request failed:", error);
    if (!res.headersSent) {
      res.statusCode = 500;
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.end(JSON.stringify({ ok:false, error:String(error?.message || error) }));
    }
  }
};
