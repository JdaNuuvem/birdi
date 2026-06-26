// Flap Copa Clone — Servidor 100% Offline
// Uso: node servidor-offline.js
// Abra http://localhost:8000
// Nenhuma dependência externa — roda completamente offline.
const http = require("http");
const fs = require("fs");
const path = require("path");
const QRCode = require("qrcode");

const PORT = 8000;
const DIR = __dirname;
const STATIC = path.join(DIR, "static");

// --- Stub responses for game to work offline ---
const STUB_INICIAR = JSON.stringify({
  success: true,
  data: { partida_id: 1, session: "offline-demo" }
});

const STUB_FINALIZAR = JSON.stringify({
  success: true,
  data: { resultado: "derrota", valor_acumulado: 0 }
});

const STUB_POST_ERROR = JSON.stringify({
  success: false,
  error: "API indisponível no modo offline"
});

// --- Script de depósito: nome+CPF no primeiro depósito ---
const DEPOSITO_SCRIPT = `<script>
function mascaraCPF(e){var v=e.value.replace(/\\D/g,'').substring(0,11);if(v.length>=10)v=v.replace(/^(\\d{3})(\\d{3})(\\d{3})(\\d{1,2})$/,'$1.$2.$3-$4');else if(v.length>6)v=v.replace(/^(\\d{3})(\\d{3})(\\d{1,3})$/,'$1.$2.$3');else if(v.length>3)v=v.replace(/^(\\d{3})(\\d{1,3})$/,'$1.$2');e.value=v}
setTimeout(function(){
  new MutationObserver(function(){
    var info=null;try{info=JSON.parse(localStorage.getItem('flappix_deposit_info')||'null')}catch(e){}
    if(info)return;
    var d=document.querySelector('[role=dialog]');
    if(!d||d.dataset.patched)return;
    var btn=Array.from(d.querySelectorAll('button')).find(function(b){return b.textContent.indexOf('Gerar QR')>=0});
    if(!btn)return;
    d.dataset.patched='1';
    var form=d.querySelector('form');
    var cupomBtn=Array.from(d.querySelectorAll('button')).find(function(b){return b.textContent.indexOf('cupom')>=0});
    var refNode=cupomBtn||form||d.querySelector('input,button')||d.firstElementChild;
    var div=document.createElement('div');
    div.innerHTML='<div style="margin:12px 0;padding:10px 14px;background:rgba(74,222,128,.06);border:1px solid rgba(74,222,128,.15);border-radius:12px"><div style="font-size:10px;color:rgba(255,255,255,.5);text-transform:uppercase;margin-bottom:6px">Primeiro dep\u00f3sito \u2014 complete seus dados</div><input type="text" id="dep-nome" placeholder="Nome completo" style="width:100%;padding:9px;border-radius:8px;border:1px solid rgba(255,255,255,.15);background:rgba(0,0,0,.25);color:#fff;font-size:13px;margin-bottom:6px;outline:none;box-sizing:border-box"><input type="text" id="dep-cpf" placeholder="CPF" style="width:100%;padding:9px;border-radius:8px;border:1px solid rgba(255,255,255,.15);background:rgba(0,0,0,.25);color:#fff;font-size:13px;outline:none;box-sizing:border-box" maxlength="14" oninput="mascaraCPF(this)"></div>';
    if(cupomBtn&&cupomBtn.parentNode)cupomBtn.parentNode.insertBefore(div.firstElementChild,cupomBtn);
    else if(refNode&&refNode.parentNode)refNode.parentNode.appendChild(div.firstElementChild);
    document.addEventListener('click',function(e){
      var b=e.target.closest('button');
      if(!b)return;
      if(b.textContent.indexOf('Gerar QR')<0)return;
      var nomeEl=document.getElementById('dep-nome');
      var cpfEl=document.getElementById('dep-cpf');
      if(!nomeEl||!cpfEl)return;
      var info2=null;try{info2=JSON.parse(localStorage.getItem('flappix_deposit_info')||'null')}catch(e){}
      if(info2)return;
      var nome=nomeEl.value.trim();
      var cpf=cpfEl.value.replace(/\\D/g,'');
      if(!nome){e.preventDefault();e.stopImmediatePropagation();alert('Informe seu nome completo');return}
      if(cpf.length!==11){e.preventDefault();e.stopImmediatePropagation();alert('CPF inválido');return}
      localStorage.setItem('flappix_deposit_info',JSON.stringify({nome:nome,cpf:cpf}));
    },true);
  }).observe(document.body,{childList:true,subtree:true});
},1500);
var origFetch=window.fetch;window.fetch=function(url,opts){if(opts&&opts.body&&typeof opts.body=='string'&&url.indexOf('/api/financeiro/deposito')>=0){try{var b=JSON.parse(opts.body);var info=JSON.parse(localStorage.getItem('flappix_deposit_info')||'null');if(info&&!b.cpf){b.cpf=info.cpf;b.nome=info.nome;opts.body=JSON.stringify(b)}}catch(e){}}return origFetch.apply(this,arguments)};
<\/script>`;

// --- API route ? cached JSON file ---
const API_CACHE = {
  "/api/public/config":    "api_public_config.json",
  "/api/flappybird/configs":"api_flappybird_configs.json",
  "/api/auth/me":          "api_auth_me.json",
  "/api/user/dashboard":   "api_dashboard.json",
  "/api/dashboard":        "api_dashboard.json",
  "/api/user/deposito-info":"api_deposito_info.json",
  "/api/indicacao/info":   "api_indicacao_info.json",
  "/api/indicacao/rede":   "api_indicacao_rede.json",
  "/api/indicacao/comissoes":"api_indicacao_comissoes.json",
};

const IMMUTABLE_EXTS = new Set([
  ".js", ".css", ".woff2", ".woff", ".ttf", ".png", ".jpg",
  ".jpeg", ".gif", ".svg", ".ico", ".webp", ".mp4", ".webm",
]);

function cachePath(reqPath) {
  const u = new URL(reqPath, "http://localhost");
  let p = u.pathname;

  if (p === "/") return path.join(STATIC, "__homepage");

  // Next.js page routes ? static dir
  if (p === "/painel") return path.join(STATIC, "painel");

  // Next.js Image Optimization: /_next/image?url=...&w=...&q=...
  if (p === "/_next/image") {
    const imgUrl = u.searchParams.get("url");
    if (imgUrl) {
      const decoded = decodeURIComponent(imgUrl);
      const imgPath = path.join(DIR, decoded);
      if (fs.existsSync(imgPath)) return imgPath;
    }
  }

  if (p.startsWith("/_next/static/"))
    return path.join(STATIC, p);

  if (p.startsWith("/img/"))
    return path.join(STATIC, p);

  // Static HTML/JS/CSS from project root
  const rootFile = path.join(DIR, p.replace(/^\//, ''));
  if (fs.existsSync(rootFile) && fs.statSync(rootFile).isFile()) return rootFile;

  // Query param cache files — match params regardless of order
  const qs = u.search;
  if (qs) {
    const wanted = new URLSearchParams(qs);
    wanted.sort();
    const prefix = p.replace(/^\//, "").replace(/\//g, "_") + "_";
    const files = fs.readdirSync(STATIC);
    for (const f of files) {
      if (!f.startsWith(prefix)) continue;
      const rest = f.substring(prefix.length).replace(/&/g, "&");
      try {
        const candidate = new URLSearchParams(rest);
        candidate.sort();
        if (candidate.toString() === wanted.toString()) {
          return path.join(STATIC, f);
        }
      } catch(e) {}
    }
    // Fallback: legacy exact match
    const sanitized = prefix + qs.substring(1).replace(/&/g, "&");
    const qFile = path.join(STATIC, sanitized.replace(/[<>:"|?*]/g, "_"));
    if (fs.existsSync(qFile)) return qFile;
  };
  return null;
}

function getContentType(filePath) {
  const map = { '.html':'text/html; charset=utf-8', '.js':'application/javascript', '.css':'text/css', '.json':'application/json', '.png':'image/png', '.jpg':'image/jpeg', '.jpeg':'image/jpeg', '.gif':'image/gif', '.svg':'image/svg+xml', '.ico':'image/x-icon', '.webp':'image/webp', '.woff':'font/woff', '.woff2':'font/woff2', '.ttf':'font/ttf' };
  return map[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
}
function getCacheControl(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return IMMUTABLE_EXTS.has(ext) ? 'public, max-age=31536000, immutable' : 'no-cache';
}
function rewriteUrls(html) { return html; }

function serveJSON(res, data, statusCode) {
  statusCode = statusCode || 200;
  const body = JSON.stringify(data);
  res.writeHead(statusCode, {
    'content-type': 'application/json',
    'access-control-allow-origin': '*',
    'content-length': Buffer.byteLength(body)
  });
  res.end(body);
}

function serveFile(filePath, res) {
  const ext = path.extname(filePath).toLowerCase();
  const isHtml = ext === ".html" || ext === "";
  const contentType = isHtml ? "text/html; charset=utf-8" : getContentType(filePath);
  const cacheControl = getCacheControl(filePath);

  let body = fs.readFileSync(filePath);

  if (isHtml) {
    let html = body.toString("utf8");
    html = rewriteUrls(html);
    if (filePath.endsWith("painel")) {
      html = html.replace('</body>', DEPOSITO_SCRIPT + '</body>');
    }
    body = Buffer.from(html, "utf8");
  }

  res.writeHead(200, {
    "content-type": contentType,
    "content-length": body.length,
    "cache-control": cacheControl,
    "access-control-allow-origin": "*",
    "content-security-policy": "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; frame-src 'none'; object-src 'none'",
  });
  res.end(body);
}

const server = http.createServer((req, res) => {
  console.log(`[${req.method}] ${req.url}`);

  // CORS preflight
  if (req.method === "OPTIONS") {
    res.writeHead(200, {
      "access-control-allow-origin": req.headers.origin || "*",
      "access-control-allow-methods": "GET,POST,PUT,OPTIONS",
      "access-control-allow-headers": "content-type,authorization,cookie,x-tenant-slug,rsc",
      "access-control-allow-credentials": "true",
    });
    return res.end();
  }

  const u = new URL(req.url, "http://localhost");
  const pathname = u.pathname;

  // --- POST handlers ---
  if (req.method === "POST") {
    if (pathname === "/api/flappybird/iniciar") {
      return serveJSON(res, JSON.parse(STUB_INICIAR));
    }
    if (pathname === "/api/flappybird/finalizar") {
      return serveJSON(res, JSON.parse(STUB_FINALIZAR));
    }
    if (pathname === "/api/financeiro/deposito") {
      let raw = "";
      req.on("data", function(c) { raw += c; });
      req.on("end", async function() {
        var body = {};
        try { body = JSON.parse(raw); } catch(e) {}
        var valor = parseInt(body.valor) || 20;
        const pix = "00020101021226820014br.gov.bcb.pix2560qrcode.a55scd.com.br/v1/" + Math.random().toString(36).substr(2, 32) + "5204000053039865802BR5917SGCINTERMEDIACOES6008SAOPAULO62070503***6304" + (Math.floor(Math.random() * 9000) + 1000);
        const qrcodeDataUri = await QRCode.toDataURL(pix, { width: 250, margin: 1 });
        serveJSON(res, { txid: "offline-" + Date.now(), valor: valor, qrcode_texto: pix, qrcode_imagem: qrcodeDataUri, qrcode_base64: qrcodeDataUri.split(",")[1] || "", gateway: "mock", expiracao_minutos: 30 });
      });
      return;
    }
    return serveJSON(res, JSON.parse(STUB_POST_ERROR), 503);
  }

  // --- GET API endpoints ? cached JSON ---
  const apiFile = API_CACHE[pathname];
  if (apiFile) {
    const fullPath = path.join(DIR, apiFile);
    if (fs.existsSync(fullPath)) {
      const raw = fs.readFileSync(fullPath, "utf8");
      return serveJSON(res, JSON.parse(raw));
    }
  }

  // Generic API GET fallback — return offline error
  if (pathname.startsWith("/api/")) {
    return serveJSON(res, { success: false, error: "Modo offline", message: "API indisponível offline" }, 503);
  }

  // --- Static files ---
  const filePath = cachePath(req.url);
  if (filePath && fs.existsSync(filePath)) {
    return serveFile(filePath, res);
  }

  // 404
  res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
  res.end("404 — Página não encontrada (modo offline)");
});

server.listen(PORT, () => {
  console.log([
    "+------------------------------------------+",
    "¦   ?? Flap Copa — Clone OFFLINE         ¦",
    "¦   Sem dependência externa              ¦",
    `¦   http://localhost:${PORT}                    ¦`,
    "+------------------------------------------+",
  ].join("\n"));
});
