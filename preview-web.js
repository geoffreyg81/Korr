// Petit serveur local pour vérifier le site construit sans dépendance externe.
// Lancez d'abord `npm run build:web`, puis `npm run preview:web`.

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "dist", "web");
const port = Number(process.env.PORT) || 4173;
const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".exe": "application/octet-stream",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".wasm": "application/wasm",
  ".webmanifest": "application/manifest+json"
};

if (!fs.existsSync(path.join(root, "index.html"))) {
  console.error("Site absent : lancez d'abord npm run build:web.");
  process.exit(1);
}

const server = http.createServer((request, response) => {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(request.url || "/", "http://localhost").pathname);
  } catch {
    response.writeHead(400);
    return response.end("Bad request");
  }

  if (pathname === "/") pathname = "/index.html";
  const target = path.resolve(root, `.${pathname}`);
  if (target !== root && !target.startsWith(`${root}${path.sep}`)) {
    response.writeHead(403);
    return response.end("Forbidden");
  }

  fs.readFile(target, (error, data) => {
    if (error) {
      response.writeHead(error.code === "ENOENT" ? 404 : 500);
      return response.end(error.code === "ENOENT" ? "Not found" : "Read error");
    }
    response.setHeader("Cache-Control", "no-store");
    response.setHeader("Content-Type", contentTypes[path.extname(target)] || "application/octet-stream");
    response.end(data);
  });
});

server.listen(port, "127.0.0.1", () => {
  console.log(`Aperçu Korr : http://127.0.0.1:${port}`);
});
