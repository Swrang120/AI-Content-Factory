// Vercel serverless entrypoint for the Express application.
let app = null;
let researchHub = null;
let bufferHub = null;
let serverInitError = null;
let researchInitError = null;

// Load the main server independently from the optional research hub.
// A failure in one module must never hide a healthy YouTube/Factory server.
try {
  app = require("../server");
} catch (error) {
  serverInitError = error;
  console.error("AI Content Factory server initialization failed:", error);
}

try {
  bufferHub = require("./buffer");
} catch (error) {
  console.error("AI Content Factory Buffer adapter initialization failed:", error);
}

try {
  researchHub = require("./research-hub");
} catch (error) {
  researchInitError = error;
  console.error("AI Content Factory research hub initialization failed:", error);
}

module.exports = async (req, res) => {
  try {
    if (bufferHub && String(req.url || "").startsWith("/api/buffer/")) {
      return await bufferHub.handler(req, res);
    }

    if (researchHub) {
      try {
        const handled = await researchHub.handler(req, res);
        if (handled !== null) return;
      } catch (error) {
        console.error("AI Content Factory research hub request failed:", error);
        // Let the main Express app continue serving all other routes.
        if (req.url && String(req.url).startsWith("/api/research/")) {
          if (!res.headersSent) {
            res.statusCode = 500;
            res.setHeader("Content-Type", "application/json; charset=utf-8");
            res.end(JSON.stringify({ ok:false, error:String(error?.message || error) }));
          }
          return;
        }
      }
    }

    if (app) return app(req, res);

    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify({
      ok: false,
      error: "Server initialization failed",
      detail: String(serverInitError?.message || serverInitError || researchInitError?.message || researchInitError || "Unknown initialization error")
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
