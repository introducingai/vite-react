import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

function decorateResponse(res) {
  res.status = function status(code) {
    res.statusCode = code;
    return res;
  };

  res.send = function send(payload) {
    if (payload === undefined || payload === null) {
      res.end("");
      return res;
    }

    if (typeof payload === "string" || Buffer.isBuffer(payload)) {
      res.end(payload);
      return res;
    }

    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify(payload));
    return res;
  };

  return res;
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(Buffer.from(chunk));
  }

  return Buffer.concat(chunks).toString("utf8");
}

function localApiPlugin() {
  return {
    name: "local-api-routes",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith("/api/")) {
          return next();
        }

        try {
          const pathname = req.url.split("?")[0];
          let modulePath = "";

          if (pathname === "/api/analyze") modulePath = "./api/analyze.js";
          else if (pathname === "/api/market-scan") modulePath = "./api/market-scan.js";
          else if (pathname === "/api/monitor") modulePath = "./api/monitor.js";
          else if (pathname === "/api/entries") modulePath = "./api/entries.js";
          else if (pathname === "/api/submissions") modulePath = "./api/submissions.js";
          else if (pathname === "/api/audit-logs") modulePath = "./api/audit-logs.js";
          else if (pathname === "/api/auth/login") modulePath = "./api/auth/login.js";
          else if (pathname === "/api/auth/session") modulePath = "./api/auth/session.js";
          else if (pathname === "/api/auth/logout") modulePath = "./api/auth/logout.js";
          else return next();

          req.body = await readBody(req);
          req.query = Object.fromEntries(new URL(req.url, "http://127.0.0.1").searchParams.entries());

          const mod = await server.ssrLoadModule(modulePath);
          const handler = mod?.default;

          if (typeof handler !== "function") {
            throw new Error(`No default handler exported from ${modulePath}.`);
          }

          await handler(req, decorateResponse(res));
        } catch (error) {
          res.statusCode = 500;
          res.setHeader("Content-Type", "application/json; charset=utf-8");
          res.end(JSON.stringify({ error: error instanceof Error ? error.message : "Local API error." }));
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), localApiPlugin()],
  server: {
    host: "127.0.0.1",
    strictPort: true,
  },
  preview: {
    host: "127.0.0.1",
    strictPort: true,
  },
});
