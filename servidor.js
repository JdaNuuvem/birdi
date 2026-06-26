// Flap Copa Clone — Proxy Server
// Uso: node servidor.js
// Abra http://localhost:8000
const http = require("http");
const https = require("https");
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const PORT = 8000;
const TARGET = "canarinhodacopa.fun";
const DIR = __dirname;
const STATIC = path.join(DIR, "static");

const BANNER_HTML = [
  '<div id="banner-prova" style="position:fixed;top:0;left:0;right:0;z-index:99999;',
  'background:linear-gradient(135deg,#f00,#c00);color:#fff;text-align:center;',
  'padding:10px 20px;font-size:20px;font-weight:900;letter-spacing:2px;',
  'text-transform:uppercase;box-shadow:0 4px 20px rgba(255,0,0,.5);',
  'border-bottom:3px solid #f44;animation:pulse-banner 2s ease-in-out infinite;',
  'line-height:1.4">',
  '⚠️ PROVA DE TESTES — 25/06/2026 ⚠️',
  '<small style="display:block;font-size:11px;font-weight:400;',
  'letter-spacing:1px;opacity:.9;margin-top:2px">',
  'Clone para análise de segurança — Ambiente controlado</small></div>',
  '<style>@keyframes pulse-banner{',
  '0%,100%{opacity:1}50%{opacity:.85}}',
  'body{margin-top:56px!important}',
  'header,main>header,[class*=header]{top:56px!important}</style>',
].join("");

const IMMUTABLE_EXTS = new Set([
  ".js", ".css", ".woff2", ".woff", ".ttf", ".png", ".jpg",
  ".jpeg", ".gif", ".svg", ".ico", ".webp", ".mp4", ".webm",
]);

// Map request path to cache file
function cachePath(reqPath) {
  const u = new URL(reqPath, "http://localhost");
  let p = u.pathname;

  // Root -> index.html
  if (p === "/") return path.join(DIR, "index.html");

  // Next.js static assets
  if (p.startsWith("/_next/static/"))
    return path.join(STATIC, p);

  // Images
  if (p.startsWith("/img/"))
    return path.join(STATIC, p);

  // HTML pages with query params from cache
  const qs = u.search; // includes leading "?"
  if (qs) {
    const sanitized = p.replace(/^\//, "").replace(/\//g, "_") + qs.replace("?", "_").replace(/&/g, "&");
    return path.join(STATIC, sanitized.replace(/[<>:"|?*]/g, "_")); // ponytail: naive sanitize, Win FS-safe
  }

  // Plain pages — check static/ first, then root
  const base = p.replace(/^\//, "").replace(/\//g, "_") || "index";
  const staticFile = path.join(STATIC, base);
  if (fs.existsSync(staticFile)) return staticFile;
  const rootFile = path.join(DIR, p.replace(/^\//, ""));
  if (fs.existsSync(rootFile) && !fs.statSync(rootFile).isDirectory())
    return rootFile;
  const htmlFile = path.join(DIR, base + ".html");
  if (fs.existsSync(htmlFile)) return htmlFile;

  return null;
}

function getCacheControl(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (IMMUTABLE_EXTS.has(ext))
    return "public, max-age=31536000, immutable";
  return "no-cache";
}

function getContentType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const types = {
    ".html": "text/html; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".svg": "image/svg+xml",
    ".ico": "image/x-icon",
    ".woff2": "font/woff2",
    ".woff": "font/woff",
    ".ttf": "font/ttf",
    ".webp": "image/webp",
    ".mp4": "video/mp4",
  };
  return types[ext] || "application/octet-stream";
}

function injectBanner(html) {
  // Inject banner + CSS after <body, preserve any attributes on body tag
  return html.replace(/(<body[^>]*>)/i, "$1" + BANNER_HTML);
}

function rewriteUrls(html) {
  // Rewrite absolute paths to use local proxy for navigation and assets
  return html.replace(
    /(src|href|action)=["'](?!https?:\/\/)(?!data:)(\/)/gi,
    (match, attr, slash) => attr + '="http://localhost:' + PORT + slash
  );
}

function decompress(buf, encoding) {
  if (encoding === "gzip" || encoding === "x-gzip")
    return zlib.gunzipSync(buf);
  if (encoding === "deflate")
    return zlib.inflateSync(buf);
  if (encoding === "br")
    return zlib.brotliDecompressSync(buf);
  return buf;
}

function proxyRequest(req, res) {
  const opts = {
    hostname: TARGET,
    port: 443,
    path: req.url,
    method: req.method,
    headers: {},
    rejectUnauthorized: false,
    timeout: 30000,
  };

  // Forward relevant headers
  const forwardHeaders = [
    "accept", "accept-encoding", "accept-language",
    "authorization", "cache-control", "content-type",
    "cookie", "referer", "user-agent", "x-tenant-slug",
    "x-forwarded-for", "x-real-ip", "rsc",
  ];
  for (const h of forwardHeaders) {
    const val = req.headers[h];
    if (val) opts.headers[h] = val;
  }
  opts.headers["host"] = TARGET;

  const proxyReq = https.request(opts, (proxyRes) => {
    const chunks = [];
    proxyRes.on("data", (chunk) => chunks.push(chunk));
    proxyRes.on("end", () => {
      let body = Buffer.concat(chunks);
      const ce = proxyRes.headers["content-encoding"];
      const ct = proxyRes.headers["content-type"] || "";

      // Decompress if needed for HTML injection
      if (ct.includes("text/html") && ce) {
        body = decompress(body, ce);
      }

      if (ct.includes("text/html")) {
        let html = body.toString("utf8");
        html = injectBanner(html);
        html = rewriteUrls(html);
        body = Buffer.from(html, "utf8");
      }

      // Copy response headers (skip hop-by-hop + content-encoding since we decompressed)
      const hopByHop = new Set([
        "transfer-encoding", "content-encoding", "content-length",
        "keep-alive", "connection", "proxy-authenticate",
        "proxy-authorization", "te", "trailer",
      ]);
      const respHeaders = {};
      for (const [k, v] of Object.entries(proxyRes.headers)) {
        if (ce && k.toLowerCase() === "content-encoding") continue; // stripped after decompression
        if (!hopByHop.has(k.toLowerCase())) respHeaders[k] = v;
      }
      respHeaders["content-length"] = body.length;
      respHeaders["access-control-allow-origin"] = "*";

      res.writeHead(proxyRes.statusCode, respHeaders);
      res.end(body);
    });
  });

  proxyReq.on("timeout", () => {
    proxyReq.destroy();
    res.writeHead(504);
    res.end("Proxy timeout");
  });

  proxyReq.on("error", (err) => {
    console.error(`[proxy error] ${req.method} ${req.url}: ${err.message}`);
    res.writeHead(502);
    res.end(`Proxy error: ${err.message}`);
  });

  if (req.method !== "GET" && req.method !== "HEAD") {
    req.pipe(proxyReq);
  } else {
    proxyReq.end();
  }
}

function serveCache(filePath, req, res) {
  const stat = fs.statSync(filePath);
  const ext = path.extname(filePath).toLowerCase();
  const isHtml = ext === ".html" || ext === ""; // cached pages have no extension
  const contentType = isHtml ? "text/html; charset=utf-8" : getContentType(filePath);
  const cacheControl = getCacheControl(filePath);

  let body = fs.readFileSync(filePath);

  if (isHtml) {
    let html = body.toString("utf8");
    if (!html.includes("banner-prova")) {
      html = injectBanner(html);
    }
    html = rewriteUrls(html);
    body = Buffer.from(html, "utf8");
  }

  res.writeHead(200, {
    "content-type": contentType,
    "content-length": body.length,
    "cache-control": cacheControl,
    "access-control-allow-origin": "*",
  });
  res.end(body);
}

const server = http.createServer((req, res) => {
  console.log(`[${req.method}] ${req.url}`);

  // OPTIONS — CORS preflight
  if (req.method === "OPTIONS") {
    res.writeHead(200, {
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET,POST,PUT,OPTIONS",
      "access-control-allow-headers": "*",
    });
    return res.end();
  }

  // POST/PUT — always proxy
  if (req.method === "POST" || req.method === "PUT") {
    return proxyRequest(req, res);
  }

  // GET/HEAD — cache-first, proxy fallback
  const filePath = cachePath(req.url);
  if (filePath && fs.existsSync(filePath)) {
    return serveCache(filePath, req, res);
  }

  proxyRequest(req, res);
});

server.listen(PORT, () => {
  console.log([
    "╔══════════════════════════════════════════╗",
    "║   🐦 Flap Copa — Clone Proxy           ║",
    `║   Mirroring: https://${TARGET}  ║`,
    `║   Local:    http://localhost:${PORT}         ║`,
    "╚══════════════════════════════════════════╝",
  ].join("\n"));
});
