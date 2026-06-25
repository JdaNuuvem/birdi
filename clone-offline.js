// Flap Copa — Clone 100% Offline
// Backend identico ao original: 24 endpoints, RSC pages, auto-auth, game, financeiro, admin
// Uso: node clone-offline.js
// Zero dependencias externas — Node.js stdlib apenas
"use strict";

const http = require("http");
const https = require("https");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const PORT = parseInt(process.env.PORT) || 8000;
const DIR = __dirname;
const DATA = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(DIR, "data");
const STATIC = path.join(DIR, "static");
// ponytail: secret fixo em dev, via env em prod
const AUTH_SECRET = process.env.AUTH_SECRET || "clone-offline-flapcopa-2026";

// --- Configuracoes do jogo (snapshot do original) ---
const GAME_CONFIG = {
  multiplicador: 10,
  taxa_por_cano: 0.2,
  valor_minimo: 3,
  valor_maximo: 100,
  entrada_valores_rapidos: [3, 5, 8, 10, 15, 20, 30, 50],
  gameplay: { dificuldade: "custom", gravidade_mult: 1, velocidade_mult: 1, abertura_mult: 1 },
  gameplay_demo: { dificuldade: "custom", gravidade_mult: 0.95, velocidade_mult: 0.95, abertura_mult: 1.05 },
  demo_multiplicador: 4,
  demo_taxa_por_cano: 0.25
};

const PUBLIC_CONFIG = {
  teste_gratis_ativo: true,
  deposito_minimo: 20,
  site_nome: "Flappix",
  site_suporte: "",
  suporte_links: [{ nome: "Canal Telegram", url: "https://t.me" }, { nome: "Suporte WhatsApp", url: "https://wa.me" }],
  site_promo: "Ganhe R$ 8 no primeiro Deposito",
  site_logo_url: null,
  site_favicon_url: null,
  mapa_ativo: "padrao",
  site_termos: "",
  popup: { ativo: false, frequencia: "sessao", icone: "", titulo: "", mensagem: "", btn_texto: "", btn_acao: "fechar", btn_url: "", imagem_url: null }
};

const DEPOSITO_INFO = {
  limites: { deposito_minimo: 20, deposito_maximo: 0, saque_minimo: 20, saque_maximo: 0, saque_afiliado_minimo: 10 },
  valores_rapidos: [20, 30, 50, 100, 200],
  botoes_labels: { "20": "MINIMO", "30": "QUENTE", "50": "HOT+CHANCES", "100": "BONUS", "200": "BONUS" },
  botoes_cores: { "20": "#ff7300", "30": "#ff0000", "50": "#11d414", "100": "#420b6f", "200": "#420b6f" },
  bonus_deposito: { ativo: true, tipo: "todos", percentual: 100, minimo: 50, maximo: 0, rollover: 0 }
};

// --- ParadisePags Gateway ---
function loadGatewayConfig() {
  const p = dbPath("gateway_config");
  if (!fs.existsSync(p)) {
    const envKey = process.env.PARADISEPAGS_SECRET_KEY || "";
    return { active: envKey ? "paradisepags" : "mock", paradisepags: { secret_key: envKey, base_url: process.env.PARADISEPAGS_BASE_URL || "https://multi.paradisepags.com" }, limites: {} };
  }
  const cfg = JSON.parse(fs.readFileSync(p, "utf8"));
  // Env vars override file config
  if (process.env.PARADISEPAGS_SECRET_KEY) {
    cfg.paradisepags = cfg.paradisepags || {};
    cfg.paradisepags.secret_key = process.env.PARADISEPAGS_SECRET_KEY;
    cfg.active = "paradisepags";
  }
  if (process.env.PARADISEPAGS_BASE_URL) {
    cfg.paradisepags = cfg.paradisepags || {};
    cfg.paradisepags.base_url = process.env.PARADISEPAGS_BASE_URL;
  }
  return cfg;
}

function saveGatewayConfig(cfg) {
  fs.writeFileSync(dbPath("gateway_config"), JSON.stringify(cfg, null, 2));
}

function getActiveGateway() {
  const cfg = loadGatewayConfig();
  if (cfg.active === "paradisepags" && cfg.paradisepags && cfg.paradisepags.secret_key) return "paradisepags";
  return "mock";
}

// ponytail: httpGet/httpsPost via stdlib http/https, sem dependencia de axios
function httpsPost(url, data, apiKey) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(data);
    const u = new URL(url);
    const opts = {
      hostname: u.hostname, port: 443, path: u.pathname + u.search,
      method: "POST",
      headers: { "Content-Type": "application/json", "X-API-Key": apiKey, "Content-Length": Buffer.byteLength(body) },
      timeout: 15000,
    };
    const req = https.request(opts, res => {
      const chunks = [];
      res.on("data", c => chunks.push(c));
      res.on("end", () => {
        try { resolve(JSON.parse(Buffer.concat(chunks).toString())); }
        catch (e) { reject(e); }
      });
    });
    req.on("error", reject);
    req.on("timeout", () => { req.destroy(); reject(new Error("Timeout")); });
    req.write(body);
    req.end();
  });
}

function httpsGet(url, apiKey) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const opts = {
      hostname: u.hostname, port: 443, path: u.pathname + u.search,
      method: "GET",
      headers: { "X-API-Key": apiKey },
      timeout: 10000,
    };
    const req = https.request(opts, res => {
      const chunks = [];
      res.on("data", c => chunks.push(c));
      res.on("end", () => {
        try { resolve(JSON.parse(Buffer.concat(chunks).toString())); }
        catch (e) { reject(e); }
      });
    });
    req.on("error", reject);
    req.on("timeout", () => { req.destroy(); reject(new Error("Timeout")); });
    req.end();
  });
}

async function paradisepagsCreateCharge({ identifier, amount, user, host }) {
  const cfg = loadGatewayConfig();
  const baseUrl = cfg.paradisepags.base_url || "https://multi.paradisepags.com";
  const apiKey = cfg.paradisepags.secret_key;
  const amountCents = Math.round(amount * 100);
  const proto = host.startsWith("localhost") ? "http" : "https";
  const webhookUrl = proto + "://" + host + "/api/webhooks/paradisepags";
  const payload = {
    amount: amountCents,
    description: "Deposito PIX - " + identifier,
    reference: identifier,
    source: "api_externa",
    postback_url: webhookUrl,
    customer: { name: user.nome, email: user.email || user.telefone + "@flappix.local", phone: user.telefone, document: user.cpf || "" },
  };
  const resp = await httpsPost(baseUrl + "/api/v1/transaction.php", payload, apiKey);
  if (resp.error || resp.status === "error") throw new Error(resp.message || "Erro ao criar cobranca");
  return {
    txid: String(resp.transaction_id || identifier),
    qrcode_imagem: "",
    qrcode_base64: resp.qr_code_base64 || "",
    qrcode_texto: resp.qr_code || "",
    checkout_url: null,
    expiracao_minutos: 30,
  };
}

async function paradisepagsCheckStatus(txid) {
  const cfg = loadGatewayConfig();
  const baseUrl = cfg.paradisepags.base_url || "https://multi.paradisepags.com";
  const apiKey = cfg.paradisepags.secret_key;
  const resp = await httpsGet(baseUrl + "/api/v1/query.php?action=get_transaction&id=" + txid, apiKey);
  const st = resp.status;
  if (st === "approved") return "aprovado";
  if (["failed", "refunded", "chargeback"].includes(st)) return "rejeitado";
  if (["processing", "under_review"].includes(st)) return "pendente";
  return "pendente";
}

// --- Banners ---
// Banner DOM (para paginas HTML estaticas que nao usam React hydration)
const BANNER_DOM = '<div id="banner-prova" style="position:fixed;top:0;left:0;right:0;z-index:99999;background:linear-gradient(135deg,#f00,#c00);color:#fff;text-align:center;padding:10px 20px;font-size:20px;font-weight:900;letter-spacing:2px;text-transform:uppercase;box-shadow:0 4px 20px rgba(255,0,0,.5);border-bottom:3px solid #f44;animation:pulse-banner 2s ease-in-out infinite;line-height:1.4">ALERTA PROVA DE TESTES 25/06/2026<small style="display:block;font-size:11px;font-weight:400;letter-spacing:1px;opacity:.9;margin-top:2px">Clone offline Ambiente controlado</small></div><style>@keyframes pulse-banner{0%,100%{opacity:1}50%{opacity:.85}}body{margin-top:56px!important}header,main>header,[class*=header]{top:56px!important}</style>';

// Banner CSS overlay (para paginas RSC — nao modifica DOM, evita quebrar React hydration)
const BANNER_CSS = '<style id="banner-prova-css">body::before{content:"ALERTA PROVA DE TESTES 25/06/2026 — Clone offline Ambiente controlado";position:fixed;top:0;left:0;right:0;z-index:99999;background:linear-gradient(135deg,#f00,#c00);color:#fff;text-align:center;padding:10px 20px;font-size:16px;font-weight:900;letter-spacing:1px;text-transform:uppercase;box-shadow:0 4px 20px rgba(255,0,0,.5);border-bottom:3px solid #f44;animation:pulse-banner 2s ease-in-out infinite;line-height:1.4;display:flex;align-items:center;justify-content:center;min-height:44px}@keyframes pulse-banner{0%,100%{opacity:1}50%{opacity:.8}}body{padding-top:52px!important}</style>';

// --- Database utilities ---
const DB = {};

function dbPath(name) { return path.join(DATA, name + ".json"); }

function readDB(name) {
  if (DB[name]) return DB[name];
  const p = dbPath(name);
  if (!fs.existsSync(p)) { DB[name] = name === "users" ? {} : []; return DB[name]; }
  DB[name] = JSON.parse(fs.readFileSync(p, "utf8"));
  return DB[name];
}

function writeDB(name) {
  fs.writeFileSync(dbPath(name), JSON.stringify(DB[name], null, 2));
}

function nextId(name) {
  const db = readDB(name);
  if (Array.isArray(db)) {
    const max = db.reduce((m, r) => Math.max(m, r.id || 0), 0);
    return max + 1;
  }
  const keys = Object.keys(db);
  const max = keys.reduce((m, k) => Math.max(m, parseInt(k) || 0), 0);
  return max + 1;
}

// --- Auth ---
function createToken(userId) {
  const iat = Math.floor(Date.now() / 1000);
  const exp = iat + 604800;
  const payload = JSON.stringify({ userId, tid: "cliente22", iat, exp });
  return Buffer.from(payload).toString("base64");
}

function decodeToken(token) {
  try {
    const json = Buffer.from(token, "base64").toString("utf8");
    const data = JSON.parse(json);
    if (data.exp && data.exp < Math.floor(Date.now() / 1000)) return null;
    return data;
  } catch (e) { return null; }
}

function getUserByToken(token) {
  const decoded = decodeToken(token);
  if (!decoded || !decoded.userId) return null;
  const users = readDB("users");
  return users[String(decoded.userId)] || null;
}

function getUserById(id) {
  const users = readDB("users");
  return users[String(id)] || null;
}

function getAuthUser(req) {
  const auth = req.headers["authorization"] || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : auth;
  if (!token) return null;
  return getUserByToken(token);
}

function isAdmin(user) {
  return user && user.role === "admin";
}

// --- Helpers ---
function parseBody(req) {
  return new Promise(resolve => {
    const chunks = [];
    req.on("data", c => chunks.push(c));
    req.on("end", () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString())); }
      catch (e) { resolve(null); }
    });
  });
}

function sendJSON(res, data, code = 200) {
  const body = Buffer.from(JSON.stringify(data));
  res.writeHead(code, {
    "content-type": "application/json; charset=utf-8",
    "content-length": body.length,
    "access-control-allow-origin": "*",
  });
  res.end(body);
}

// Gera token para injecao nas paginas RSC
function makeAutoToken() {
  const users = readDB("users");
  // Pega o primeiro usuario nao-admin para auto-login nas paginas RSC
  const regular = Object.values(users).find(u => u.role !== "admin");
  if (regular && regular.token) return regular.token;
  return createToken(2);
}

const IMMUTABLE_EXTS = new Set([".js", ".css", ".woff2", ".woff", ".ttf", ".png", ".jpg", ".jpeg", ".gif", ".svg", ".ico", ".webp", ".mp4", ".webm"]);

function getContentType(fp) {
  const t = path.extname(fp).toLowerCase();
  const m = {
    ".html": "text/html; charset=utf-8", ".js": "application/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8",
    ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
    ".gif": "image/gif", ".svg": "image/svg+xml", ".ico": "image/x-icon",
    ".woff2": "font/woff2", ".woff": "font/woff", ".ttf": "font/ttf",
    ".webp": "image/webp", ".mp4": "video/mp4"
  };
  return m[t] || "application/octet-stream";
}

// --- Static file routing ---
// Mapa de paginas RSC cacheadas
const RSC_PAGES = {
  "/painel": "static/painel",
  "/jogar": null, // resolvido via query params abaixo
};

// Inject banner CSS + auto-auth token into RSC pages
function injectRSCBanner(html, filePath) {
  if (html.includes("banner-prova")) return html;
  // Skip auto-auth for free/demo game pages
  const isFreeGame = filePath.includes("jogar_gratis=1");
  if (!isFreeGame) {
    const autoToken = makeAutoToken();
    const inject = '<script>localStorage.setItem("flappix_token","' + autoToken + '");</script>';
    html = html.replace("<head>", "<head>" + inject);
  }
  html = html.replace("</head>", BANNER_CSS + "</head>");
  return html;
}

function injectStaticBanner(html) {
  if (html.includes("banner-prova")) return html;
  return html.replace(/(<body[^>]*>)/i, "$1" + BANNER_DOM);
}

function rewriteUrls(html, reqHost) {
  const base = "http://" + (reqHost || ("localhost:" + PORT));
  return html.replace(/(src|href|action)=["'](?!https?:\/\/)(?!data:)(\/)/gi,
    (m, attr, slash) => attr + '="' + base + slash);
}

// Resolve jogar RSC query params
function resolveJogarRSC(query) {
  const gratis = query.get("gratis");
  const auto = query.get("auto");
  const mapa = query.get("mapa") || "brasil";
  if (gratis === "1" && mapa) {
    const fname = "jogar_gratis=1&mapa=" + mapa;
    const fp = path.join(STATIC, fname);
    if (fs.existsSync(fp)) return fp;
  }
  if (auto === "1") {
    // Paid mode with any valor/mapa — use generic RSC shell
    const valor = query.get("valor") || "10";
    const fname = "jogar_valor=" + valor + "&auto=1&mapa=" + mapa;
    const fp = path.join(STATIC, fname);
    if (fs.existsSync(fp)) return fp;
    // Fallback: try the generic paid template
    const generic = path.join(STATIC, "jogar_valor=10&auto=1&mapa=brasil");
    if (fs.existsSync(generic)) return generic;
  }
  return null;
}

function resolveStatic(reqPath) {
  const u = new URL(reqPath, "http://localhost");
  let p = u.pathname;

  // RSC: / — usa pagina capturada do original
  if (p === "/") {
    const homeRSC = path.join(STATIC, "__homepage");
    if (fs.existsSync(homeRSC)) return homeRSC;
    return path.join(DIR, "index.html");
  }

  // RSC: /painel
  if (p === "/painel") {
    const fp = path.join(DIR, "static", "painel");
    if (fs.existsSync(fp)) return fp;
  }

  // RSC: /jogar with query params
  if (p === "/jogar") {
    const rsc = resolveJogarRSC(u.searchParams);
    if (rsc) return rsc;
    // fallback to jogar.html
    return path.join(DIR, "jogar.html");
  }

  if (p.startsWith("/_next/static/")) return path.join(STATIC, p);
  if (p.startsWith("/img/")) return path.join(STATIC, p);
  if (p.startsWith("/api/")) return null;

  const qs = u.search;
  if (qs) {
    const sanitized = p.replace(/^\//, "").replace(/\//g, "_") + qs.replace("?", "_").replace(/&/g, "&");
    const qFile = path.join(STATIC, sanitized.replace(/[<>:"|?*]/g, "_"));
    if (fs.existsSync(qFile)) return qFile;
  }

  const base = p.replace(/^\//, "").replace(/\//g, "_") || "index";
  const staticFile = path.join(STATIC, base);
  if (fs.existsSync(staticFile)) return staticFile;
  const rootFile = path.join(DIR, p.replace(/^\//, ""));
  if (fs.existsSync(rootFile) && !fs.statSync(rootFile).isDirectory()) return rootFile;
  const htmlFile = path.join(DIR, base + ".html");
  if (fs.existsSync(htmlFile)) return htmlFile;

  return null;
}

function serveRawFile(filePath, res) {
  const ct = getContentType(filePath);
  const body = fs.readFileSync(filePath);
  res.writeHead(200, {
    "content-type": ct,
    "content-length": body.length,
    "cache-control": "public, max-age=86400",
    "access-control-allow-origin": "*",
  });
  res.end(body);
}

function serveFile(filePath, res, reqHost) {
  const ext = path.extname(filePath).toLowerCase();
  const isRSC = ext === "" && !filePath.endsWith(".html");
  const isHtml = ext === ".html" || isRSC;
  const ct = getContentType(filePath);
  const cache = IMMUTABLE_EXTS.has(ext) ? "public, max-age=31536000, immutable" : "no-cache";

  let body = fs.readFileSync(filePath);
  if (isHtml) {
    let html = body.toString("utf8");
    if (isRSC) {
      html = injectRSCBanner(html, filePath);
      html = rewriteUrls(html, reqHost);
    } else {
      html = injectStaticBanner(html);
      html = rewriteUrls(html, reqHost);
    }
    body = Buffer.from(html, "utf8");
  }

  res.writeHead(200, {
    "content-type": isHtml ? "text/html; charset=utf-8" : ct,
    "content-length": body.length,
    "cache-control": cache,
    "access-control-allow-origin": "*",
  });
  res.end(body);
}

// --- API Handlers: Public (RAW format — fetcher JS envelopa) ---

// Este endpoint e usado pelo modulo 7032 do layout que espera {success,data}
function apiPublicConfig(req, res) {
  sendJSON(res, { success: true, data: PUBLIC_CONFIG });
}

function apiFlappybirdConfigs(req, res) {
  sendJSON(res, GAME_CONFIG);
}

async function apiAuthLogin(req, res) {
  const body = await parseBody(req);
  if (!body || !body.telefone || !body.senha)
    return sendJSON(res, { error: "Telefone e senha obrigatorios" }, 400);
  const users = readDB("users");
  const user = Object.values(users).find(u => u.telefone === body.telefone && u.senha === body.senha);
  if (!user) return sendJSON(res, { error: "Telefone ou senha invalidos" }, 401);
  if (!user.token) { user.token = createToken(user.id); writeDB("users"); }
  sendJSON(res, {
    token: user.token,
    user: { id: user.id, nome: user.nome, telefone: user.telefone, saldo: user.saldo,
      saldo_afiliado: user.saldo_afiliado, codigo_indicacao: user.codigo_indicacao,
      created_at: user.created_at }
  });
}

async function apiAuthRegister(req, res) {
  const body = await parseBody(req);
  if (!body || !body.nome || !body.telefone || !body.senha)
    return sendJSON(res, { error: "Campos obrigatorios: nome, telefone, senha" }, 400);
  if (body.senha.length < 6)
    return sendJSON(res, { error: "Senha deve ter no minimo 6 caracteres" }, 400);
  const users = readDB("users");
  if (Object.values(users).find(u => u.telefone === body.telefone))
    return sendJSON(res, { error: "Telefone ja cadastrado" }, 409);
  const id = nextId("users");
  const codigo = "ATFRX" + Math.random().toString(36).substring(2, 5).toUpperCase();
  const token = createToken(id);
  const user = {
    id, nome: body.nome, telefone: body.telefone, senha: body.senha,
    saldo: 0, saldo_afiliado: 0, codigo_indicacao: codigo,
    indicado_por: body.indicado_por || null, token,
    created_at: new Date().toISOString()
  };
  users[String(id)] = user;
  writeDB("users");
  sendJSON(res, {
    token, user: { id: user.id, nome: user.nome, telefone: user.telefone,
      saldo: user.saldo, saldo_afiliado: user.saldo_afiliado,
      codigo_indicacao: user.codigo_indicacao, created_at: user.created_at }
  }, 201);
}

// --- API Handlers: User (RAW format) ---

function apiAuthMe(req, res) {
  const user = getAuthUser(req);
  if (!user) return sendJSON(res, { error: "Nao autorizado" }, 401);
  sendJSON(res, { user: { id: user.id, nome: user.nome, telefone: user.telefone,
    saldo: user.saldo, saldo_afiliado: user.saldo_afiliado,
    codigo_indicacao: user.codigo_indicacao, created_at: user.created_at } });
}

function apiDashboard(req, res) {
  const user = getAuthUser(req);
  if (!user) return sendJSON(res, { error: "Nao autorizado" }, 401);
  const partidas = readDB("partidas").filter(p => p.user_id === user.id);
  const vitorias = partidas.filter(p => p.ganhou).length;
  const recorde = partidas.reduce((m, p) => Math.max(m, p.canos_passados || 0), 0);
  const u = getUserById(user.id) || user;
  sendJSON(res, { saldo: u.saldo, saldo_afiliado: u.saldo_afiliado,
    total_partidas: partidas.length, vitorias, recorde_canos: recorde });
}

function apiHistorico(req, res) {
  const user = getAuthUser(req);
  if (!user) return sendJSON(res, { error: "Nao autorizado" }, 401);
  const partidas = readDB("partidas").filter(p => p.user_id === user.id)
    .sort((a, b) => (b.id || 0) - (a.id || 0));
  sendJSON(res, { partidas: partidas.map(p => ({
    id: p.id, valor_entrada: String(p.valor_entrada),
    valor_meta: String(p.valor_entrada * GAME_CONFIG.multiplicador),
    canos_passados: p.canos_passados,
    valor_acumulado: String((p.canos_passados || 0) * p.valor_por_cano),
    status: p.ganhou ? "vitoria" : "derrota",
    created_at: p.created_at, finished_at: p.finished_at
  })) });
}

function apiDepositoInfo(req, res) {
  const user = getAuthUser(req);
  if (!user) return sendJSON(res, { error: "Nao autorizado" }, 401);
  sendJSON(res, DEPOSITO_INFO);
}

async function apiAlterarSenha(req, res) {
  const user = getAuthUser(req);
  if (!user) return sendJSON(res, { error: "Nao autorizado" }, 401);
  const body = await parseBody(req);
  if (!body || !body.senha_atual || !body.senha_nova)
    return sendJSON(res, { error: "Campos obrigatorios: senha_atual, senha_nova" }, 400);
  if (body.senha_atual !== user.senha)
    return sendJSON(res, { error: "Senha atual incorreta" }, 400);
  if (body.senha_nova.length < 6)
    return sendJSON(res, { error: "Nova senha deve ter no minimo 6 caracteres" }, 400);
  user.senha = body.senha_nova;
  writeDB("users");
  sendJSON(res, { message: "Senha alterada com sucesso" });
}

// --- API Handlers: Game (mantem formato RAW) ---

async function apiIniciarPartida(req, res) {
  const user = getAuthUser(req);
  if (!user) return sendJSON(res, { error: "Nao autorizado" }, 401);
  const body = await parseBody(req);
  const valor = body ? (body.valor_entrada || body.valor || 0) : 0;
  const isDemo = valor <= 0;

  if (!isDemo && (valor < GAME_CONFIG.valor_minimo || valor > GAME_CONFIG.valor_maximo))
    return sendJSON(res, { error: "Valor de entrada invalido. Min: R$ " +
      GAME_CONFIG.valor_minimo + ", Max: R$ " + GAME_CONFIG.valor_maximo }, 400);

  const u = getUserById(user.id);
  if (!u) return sendJSON(res, { error: "Usuario nao encontrado" }, 500);

  const mult = isDemo ? GAME_CONFIG.demo_multiplicador : GAME_CONFIG.multiplicador;
  const taxa = isDemo ? GAME_CONFIG.demo_taxa_por_cano : GAME_CONFIG.taxa_por_cano;
  const valorReal = isDemo ? 5 : valor; // demo usa R$5 como base para calculos visuais

  if (!isDemo) {
    if (u.saldo < valor) return sendJSON(res, { error: "Saldo insuficiente" }, 400);
    u.saldo = Math.round((u.saldo - valor) * 100) / 100;
  }

  const valorPorCano = Math.round(valorReal * taxa * 100) / 100;
  const canosMeta = Math.ceil((valorReal * mult) / valorPorCano);
  const id = nextId("partidas");

  const partida = {
    id, user_id: u.id, valor_entrada: valorReal, valor_por_cano: valorPorCano,
    canos_para_meta: canosMeta, canos_passados: 0, resgatou: false,
    ganhou: false, valor_ganho_ou_perdido: 0, status: "em_andamento",
    mapa: body.mapa || null, created_at: new Date().toISOString(),
    finished_at: null, finalizado: false, demo: isDemo
  };
  readDB("partidas").push(partida);
  writeDB("partidas");
  if (!isDemo) writeDB("users");

  sendJSON(res, { partida_id: id, valor_por_cano: valorPorCano,
    canos_para_meta: canosMeta, valor_meta: Math.round(valorReal * mult * 100) / 100,
    valor_entrada: valorReal, saldo_novo: u.saldo, is_demo: isDemo });
}

async function apiFinalizarPartida(req, res) {
  const user = getAuthUser(req);
  if (!user) return sendJSON(res, { error: "Nao autorizado" }, 401);
  const body = await parseBody(req);
  if (!body || !body.partida_id)
    return sendJSON(res, { error: "partida_id obrigatorio" }, 400);

  const partidas = readDB("partidas");
  const p = partidas.find(pp => pp.id === body.partida_id && pp.user_id === user.id);
  if (!p) return sendJSON(res, { error: "Partida nao encontrada" }, 404);
  if (p.finalizado) return sendJSON(res, { error: "Partida ja finalizada" }, 400);

  p.canos_passados = body.canos_passados || 0;
  p.resgatou = !!body.resgatou;
  p.finished_at = new Date().toISOString();
  p.finalizado = true;

  const u = getUserById(user.id);
  if (!u) return sendJSON(res, { error: "Usuario nao encontrado" }, 500);

  if (p.resgatou) {
    const ganho = Math.round(p.canos_passados * p.valor_por_cano * 100) / 100;
    p.valor_ganho_ou_perdido = ganho;
    p.ganhou = p.canos_passados >= p.canos_para_meta;
    if (!p.demo) u.saldo = Math.round((u.saldo + ganho) * 100) / 100;
  } else {
    p.valor_ganho_ou_perdido = 0;
    p.ganhou = false;
  }
  p.status = p.ganhou ? "vitoria" : "derrota";

  writeDB("partidas");
  writeDB("users");

  sendJSON(res, { ganhou: p.ganhou, saldo_novo: u.saldo,
    valor_ganho_ou_perdido: p.valor_ganho_ou_perdido,
    canos_passados: p.canos_passados, canos_para_meta: p.canos_para_meta });
}

// --- API Handlers: Financeiro (RAW format) ---

async function apiDeposito(req, res) {
  const user = getAuthUser(req);
  if (!user) return sendJSON(res, { error: "Nao autorizado" }, 401);
  const body = await parseBody(req);
  if (!body || !body.valor) return sendJSON(res, { error: "Valor obrigatorio" }, 400);

  const valor = parseFloat(body.valor);
  const gwCfg = loadGatewayConfig();
  const min = gwCfg.limites ? (gwCfg.limites.deposito_minimo || DEPOSITO_INFO.limites.deposito_minimo) : DEPOSITO_INFO.limites.deposito_minimo;
  if (valor < min)
    return sendJSON(res, { error: "Deposito minimo: R$ " + min.toFixed(2) }, 400);

  const gw = getActiveGateway();
  let txid, qrcodeImagem, qrcodeTexto, qrcodeBase64, gateway;

  if (gw === "paradisepags") {
    try {
      const identifier = "DEP_" + user.id + "_" + Date.now();
      const host = req.headers.host || ("localhost:" + PORT);
      const result = await paradisepagsCreateCharge({ identifier, amount: valor, user, host });
      txid = result.txid;
      qrcodeTexto = result.qrcode_texto;
      qrcodeBase64 = result.qrcode_base64;
      qrcodeImagem = qrcodeBase64 || "data:image/png;base64,iVBORw0KGgo==";
      gateway = "paradisepags";
    } catch (e) {
      console.error("[DEPOSITO Paradise ERROR]", e.message);
      return sendJSON(res, { error: "Erro ao gerar cobranca PIX. Tente novamente." }, 500);
    }
  } else {
    // Mock fallback — QR code simulado + aprovacao automatica
    txid = crypto.randomBytes(12).toString("hex").toUpperCase().substring(0, 24);
    const uuid = crypto.randomUUID();
    qrcodeTexto = "00020101021226820014br.gov.bcb.pix2560qrcode.a55scd.com.br/v1/" +
      uuid + "5204000053039865802BR5917SGCINTERMEDIACOES6008SAOPAULO62070503***6304" +
      Math.floor(Math.random() * 9000 + 1000).toString().padStart(4, "0");
    qrcodeImagem = "data:image/png;base64,iVBORw0KGgo==";
    qrcodeBase64 = "";
    gateway = "mock";
  }

  const deposito = {
    txid, user_id: user.id, valor, status: "pendente",
    aceitar_bonus: !!body.aceitar_bonus_deposito, valor_bonus: 0,
    valor_creditado_total: valor, cpf: body.cpf || null,
    created_at: new Date().toISOString(), aprovado_em: null,
    qrcode_texto: qrcodeTexto, gateway, expiracao_minutos: 30,
    gateway_identifier: (gw === "paradisepags" ? identifier : null)
  };
  readDB("depositos").push(deposito);
  writeDB("depositos");

  // Mock: aprovacao automatica em 15s (só no fallback, Paradise usa webhook)
  if (gw === "mock") {
    setTimeout(() => {
      const deps = readDB("depositos");
      const d = deps.find(dd => dd.txid === txid && dd.status === "pendente");
      if (!d) return;
      d.status = "aprovado";
      d.aprovado_em = new Date().toISOString();
      const u = getUserById(user.id);
      if (u) {
        let bonus = 0;
        if (d.aceitar_bonus && valor >= DEPOSITO_INFO.bonus_deposito.minimo) {
          bonus = valor * DEPOSITO_INFO.bonus_deposito.percentual / 100;
          u.saldo += bonus;
        }
        u.saldo = Math.round((u.saldo + valor) * 100) / 100;
        u.total_depositado = (u.total_depositado || 0) + valor;
        d.valor_bonus = bonus;
        d.valor_creditado_total = valor + bonus;
      }
      writeDB("depositos");
      writeDB("users");
    }, 15000);
  }

  sendJSON(res, { txid, valor,
    qrcode_imagem: qrcodeImagem,
    qrcode_base64: qrcodeBase64,
    qrcode_texto: qrcodeTexto, gateway,
    expiracao_minutos: 30,
    instrucao: "Escaneie o QR Code ou use o codigo copia e cola para pagar." });
}

async function apiDepositoStatus(req, res, txid) {
  const user = getAuthUser(req);
  if (!user) return sendJSON(res, { error: "Nao autorizado" }, 401);
  const deps = readDB("depositos");
  const d = deps.find(dd => dd.txid.toUpperCase() === txid.toUpperCase() && dd.user_id === user.id);
  if (!d) return sendJSON(res, { error: "Deposito nao encontrado" }, 404);

  // Poll Paradise se gateway ativo e deposito pendente
  if (d.gateway === "paradisepags" && d.status === "pendente") {
    try {
      const remote = await paradisepagsCheckStatus(d.txid);
      if (remote === "aprovado") {
        d.status = "aprovado";
        d.aprovado_em = new Date().toISOString();
        const u = getUserById(user.id);
        if (u) {
          let bonus = 0;
          if (d.aceitar_bonus && d.valor >= DEPOSITO_INFO.bonus_deposito.minimo)
            bonus = d.valor * DEPOSITO_INFO.bonus_deposito.percentual / 100;
          u.saldo = Math.round((u.saldo + d.valor + bonus) * 100) / 100;
          u.total_depositado = (u.total_depositado || 0) + d.valor;
          d.valor_bonus = bonus;
          d.valor_creditado_total = d.valor + bonus;
        }
        writeDB("depositos");
        writeDB("users");
      } else if (remote === "rejeitado") {
        d.status = "rejeitado";
        writeDB("depositos");
      }
    } catch (e) {
      console.warn("[DEPOSITO STATUS] Polling Paradise falhou:", e.message);
    }
  }

  const u = getUserById(user.id);
  sendJSON(res, {
    status: d.status, valor: d.valor,
    saldo_novo: u ? u.saldo : 0, valor_bonus: d.valor_bonus || 0,
    valor_creditado_total: d.valor_creditado_total,
    bonus_rollover_multiplicador: 0
  });
}

async function apiSaque(req, res) {
  const user = getAuthUser(req);
  if (!user) return sendJSON(res, { error: "Nao autorizado" }, 401);
  const body = await parseBody(req);
  if (!body || !body.valor || !body.chave_pix)
    return sendJSON(res, { error: "Campos obrigatorios: valor, chave_pix" }, 400);

  const valor = parseFloat(body.valor);
  if (valor < DEPOSITO_INFO.limites.saque_minimo)
    return sendJSON(res, { error: "Saque minimo: R$ " +
      DEPOSITO_INFO.limites.saque_minimo.toFixed(2) }, 400);

  const u = getUserById(user.id);
  if (!u || u.saldo < valor)
    return sendJSON(res, { error: "Saldo insuficiente" }, 400);

  u.saldo = Math.round((u.saldo - valor) * 100) / 100;
  const saque = { id: nextId("saques"), user_id: user.id, valor,
    chave_pix: body.chave_pix, cpf: body.cpf || null, status: "aprovado",
    created_at: new Date().toISOString() };
  readDB("saques").push(saque);
  writeDB("saques");
  writeDB("users");

  sendJSON(res, { message: "Saque solicitado com sucesso", valor, saldo_novo: u.saldo });
}

async function apiSaqueAfiliado(req, res) {
  const user = getAuthUser(req);
  if (!user) return sendJSON(res, { error: "Nao autorizado" }, 401);
  const body = await parseBody(req);
  if (!body || !body.valor || !body.chave_pix)
    return sendJSON(res, { error: "Campos obrigatorios: valor, chave_pix" }, 400);

  const valor = parseFloat(body.valor);
  const minAfiliado = DEPOSITO_INFO.limites.saque_afiliado_minimo || 10;
  if (valor < minAfiliado)
    return sendJSON(res, { error: "Saque minimo: R$ " + minAfiliado.toFixed(2) }, 400);

  const u = getUserById(user.id);
  if (!u || u.saldo_afiliado < valor)
    return sendJSON(res, { error: "Saldo afiliado insuficiente" }, 400);

  u.saldo_afiliado = Math.round((u.saldo_afiliado - valor) * 100) / 100;
  writeDB("users");
  sendJSON(res, { message: "Saque afiliado solicitado com sucesso", valor });
}

function apiMeusSaques(req, res) {
  const user = getAuthUser(req);
  if (!user) return sendJSON(res, { error: "Nao autorizado" }, 401);
  const saques = readDB("saques").filter(s => s.user_id === user.id)
    .sort((a, b) => (b.id || 0) - (a.id || 0));
  sendJSON(res, { saques });
}

// --- API Handlers: Cupons (RAW format) ---

async function apiCuponsValidar(req, res) {
  const user = getAuthUser(req);
  if (!user) return sendJSON(res, { error: "Nao autorizado" }, 401);
  const body = await parseBody(req);
  if (!body || !body.codigo) return sendJSON(res, { error: "Codigo obrigatorio" }, 400);

  const cupons = readDB("cupons");
  const c = cupons.find(cc => cc.codigo.toUpperCase() === body.codigo.toUpperCase());
  if (!c) return sendJSON(res, { error: "Cupom invalido ou inativo" }, 404);
  if (c.usado) return sendJSON(res, { error: "Cupom ja utilizado" }, 400);
  if (c.user_id && c.user_id !== user.id)
    return sendJSON(res, { error: "Cupom invalido para este usuario" }, 400);

  sendJSON(res, { valido: true, valor: c.valor,
    mensagem: "Cupom de R$ " + c.valor.toFixed(2) + " validado com sucesso!" });
}

async function apiCuponsResgatar(req, res) {
  const user = getAuthUser(req);
  if (!user) return sendJSON(res, { error: "Nao autorizado" }, 401);
  const body = await parseBody(req);
  if (!body || !body.codigo) return sendJSON(res, { error: "Codigo obrigatorio" }, 400);

  const cupons = readDB("cupons");
  const c = cupons.find(cc => cc.codigo.toUpperCase() === body.codigo.toUpperCase());
  if (!c) return sendJSON(res, { error: "Cupom invalido ou inativo" }, 404);
  if (c.usado) return sendJSON(res, { error: "Cupom ja utilizado" }, 400);
  if (c.user_id && c.user_id !== user.id)
    return sendJSON(res, { error: "Cupom invalido para este usuario" }, 400);

  c.usado = true;
  const u = getUserById(user.id);
  if (u) u.saldo = Math.round((u.saldo + c.valor) * 100) / 100;
  writeDB("cupons");
  writeDB("users");

  sendJSON(res, { message: "Cupom resgatado com sucesso!", valor: c.valor, saldo_novo: u ? u.saldo : 0 });
}

// --- API Handlers: Indicacao (RAW format) ---

function apiIndicacaoInfo(req, res) {
  const user = getAuthUser(req);
  if (!user) return sendJSON(res, { error: "Nao autorizado" }, 401);
  const users = readDB("users");
  const todos = Object.values(users);
  const indicados = todos.filter(u => u.indicado_por === user.codigo_indicacao);
  const comDeps = indicados.filter(u => (u.total_depositado || 0) > 0).length;
  const totalComissao = indicados.reduce((s, u) => s + (u.comissao_gerada || 0), 0);
  sendJSON(res, {
    codigo: user.codigo_indicacao, codigo_indicacao: user.codigo_indicacao,
    link: "http://localhost:" + PORT + "/?ref=" + user.codigo_indicacao,
    total_indicados: indicados.length, total_com_deposito: comDeps,
    comissao_nivel1_perc: 60, comissao_nivel2_perc: 0, comissao_nivel3_perc: 0,
    saldo_afiliado: user.saldo_afiliado || 0, total_comissao: totalComissao
  });
}

function apiIndicacaoRede(req, res) {
  const user = getAuthUser(req);
  if (!user) return sendJSON(res, { error: "Nao autorizado" }, 401);
  const users = readDB("users");
  const indicados = Object.values(users).filter(u => u.indicado_por === user.codigo_indicacao);
  sendJSON(res, indicados.map(u => ({
    id: u.id, nome: u.nome, telefone: u.telefone,
    total_depositado: u.total_depositado || 0,
    comissao_gerada: u.comissao_gerada || 0, created_at: u.created_at
  })));
}

function apiIndicacaoComissoes(req, res) {
  const user = getAuthUser(req);
  if (!user) return sendJSON(res, { error: "Nao autorizado" }, 401);
  const depositos = readDB("depositos").filter(d => d.status === "aprovado");
  const users = readDB("users");
  const indicados = Object.values(users).filter(u => u.indicado_por === user.codigo_indicacao);
  const map = {}; indicados.forEach(u => { map[u.id] = u; });

  const comissoes = [];
  depositos.forEach(d => {
    const ind = map[d.user_id];
    if (ind) comissoes.push({
      nivel: 1, indicado_nome: ind.nome, valor_deposito: d.valor,
      valor: Math.round(d.valor * 0.6 * 100) / 100,
      created_at: d.aprovado_em || d.created_at
    });
  });
  sendJSON(res, { comissoes });
}

// --- API Handlers: Admin (RAW format) ---

async function apiAdminAddSaldo(req, res) {
  const user = getAuthUser(req);
  if (!isAdmin(user)) return sendJSON(res, { error: "Acesso negado. Requer role admin." }, 403);
  const body = await parseBody(req);
  if (!body || !body.user_id || !body.valor)
    return sendJSON(res, { error: "user_id e valor obrigatorios" }, 400);
  const target = getUserById(body.user_id);
  if (!target) return sendJSON(res, { error: "Usuario nao encontrado" }, 404);
  target.saldo = Math.round((target.saldo + body.valor) * 100) / 100;
  writeDB("users");
  sendJSON(res, { message: "Saldo adicionado com sucesso", saldo_novo: target.saldo });
}

function apiAdminUsuarios(req, res) {
  const user = getAuthUser(req);
  if (!isAdmin(user)) return sendJSON(res, { error: "Acesso negado. Requer role admin." }, 403);
  const users = readDB("users");
  sendJSON(res, Object.values(users).map(u => ({
    id: u.id, nome: u.nome, telefone: u.telefone,
    saldo: u.saldo, saldo_afiliado: u.saldo_afiliado, created_at: u.created_at
  })));
}

function apiAdminBalance(req, res) {
  const user = getAuthUser(req);
  if (!isAdmin(user)) return sendJSON(res, { error: "Acesso negado. Requer role admin." }, 403);
  const users = readDB("users");
  const all = Object.values(users);
  const totalSaldo = all.reduce((s, u) => s + u.saldo, 0);
  const partidas = readDB("partidas");
  const depositos = readDB("depositos").filter(d => d.status === "aprovado");
  sendJSON(res, {
    total_usuarios: all.length, saldo_total: totalSaldo,
    total_partidas: partidas.length, total_depositos: depositos.length,
    valor_depositado: depositos.reduce((s, d) => s + d.valor, 0)
  });
}

// --- Admin: Gateway Config ---
function apiAdminGatewayGet(req, res) {
  const user = getAuthUser(req);
  if (!isAdmin(user)) return sendJSON(res, { error: "Acesso negado. Requer role admin." }, 403);
  const cfg = loadGatewayConfig();
  // Nao expor a secret key completa na resposta — mascara parcial
  const safe = JSON.parse(JSON.stringify(cfg));
  if (safe.paradisepags && safe.paradisepags.secret_key && safe.paradisepags.secret_key.length > 8) {
    safe.paradisepags.secret_key = safe.paradisepags.secret_key.substring(0, 4) + "****" + safe.paradisepags.secret_key.slice(-4);
  }
  sendJSON(res, { active: cfg.active || "mock", paradisepags: safe.paradisepags || {}, limites: cfg.limites || {} });
}

async function apiAdminGatewayPut(req, res) {
  const user = getAuthUser(req);
  if (!isAdmin(user)) return sendJSON(res, { error: "Acesso negado. Requer role admin." }, 403);
  const body = await parseBody(req);
  const cfg = loadGatewayConfig();
  if (body.active) cfg.active = body.active;
  if (body.paradisepags) {
    cfg.paradisepags = cfg.paradisepags || {};
    if (body.paradisepags.secret_key) cfg.paradisepags.secret_key = body.paradisepags.secret_key;
    if (body.paradisepags.base_url) cfg.paradisepags.base_url = body.paradisepags.base_url;
    if (body.paradisepags.webhook_secret !== undefined) cfg.paradisepags.webhook_secret = body.paradisepags.webhook_secret;
  }
  if (body.limites) {
    cfg.limites = cfg.limites || {};
    if (body.limites.deposito_minimo !== undefined) cfg.limites.deposito_minimo = body.limites.deposito_minimo;
    if (body.limites.saque_minimo !== undefined) cfg.limites.saque_minimo = body.limites.saque_minimo;
  }
  saveGatewayConfig(cfg);
  sendJSON(res, { message: "Configuracoes salvas com sucesso", active: cfg.active });
}

// --- Webhook ParadisePags ---
async function apiWebhookParadise(req, res) {
  const body = await parseBody(req);
  if (!body) return sendJSON(res, { error: "Payload invalido" }, 400);
  const { transaction_id, external_id, status, amount } = body;
  if (!status || (!transaction_id && !external_id))
    return sendJSON(res, { error: "Campos obrigatorios ausentes" }, 400);

  const ua = String(req.headers["user-agent"] || "");
  const cfg = loadGatewayConfig();
  const configuredSecret = cfg.paradisepags && cfg.paradisepags.webhook_secret;
  if (configuredSecret) {
    const sentSig = req.headers["x-webhook-signature"];
    if (sentSig !== configuredSecret) {
      console.warn("[WEBHOOK Paradise] Assinatura invalida");
      return sendJSON(res, { error: "Assinatura invalida" }, 401);
    }
  } else if (!ua.startsWith("Paradise-Multi-Webhook")) {
    console.warn("[WEBHOOK Paradise] User-Agent invalido: " + ua);
    return sendJSON(res, { error: "User-Agent invalido" }, 401);
  }

  let tx = readDB("depositos").find(t => t.txid === String(transaction_id));
  if (!tx) tx = readDB("depositos").find(t => t.txid === external_id || t.gateway_identifier === external_id);
  if (!tx) { console.warn("[WEBHOOK Paradise] TX nao encontrada: " + (transaction_id || external_id)); return sendJSON(res, { ok: true }); }

  // Log webhook
  const webhookLog = { txid: transaction_id || external_id, status, amount, received_at: new Date().toISOString() };
  const logs = readDB("webhook_logs");
  logs.unshift(webhookLog);
  if (logs.length > 50) logs.length = 50;
  writeDB("webhook_logs");

  if (status === "approved" && tx.status !== "aprovado") {
    tx.status = "aprovado";
    tx.aprovado_em = new Date().toISOString();
    const u = getUserById(tx.user_id);
    if (u) {
      let bonus = 0;
      if (tx.aceitar_bonus && tx.valor >= DEPOSITO_INFO.bonus_deposito.minimo)
        bonus = tx.valor * DEPOSITO_INFO.bonus_deposito.percentual / 100;
      u.saldo = Math.round((u.saldo + tx.valor + bonus) * 100) / 100;
      u.total_depositado = (u.total_depositado || 0) + tx.valor;
      tx.valor_bonus = bonus;
      tx.valor_creditado_total = tx.valor + bonus;
    }
    writeDB("depositos");
    writeDB("users");
    console.log("[WEBHOOK Paradise] Deposito aprovado: user=" + tx.user_id + " valor=" + tx.valor);
  } else if (["failed", "refunded", "chargeback"].includes(status)) {
    tx.status = status === "refunded" ? "reembolsado" : "rejeitado";
    writeDB("depositos");
    console.log("[WEBHOOK Paradise] Deposito " + status + ": user=" + tx.user_id);
  } else if (["processing", "under_review"].includes(status)) {
    tx.status = "processando";
    writeDB("depositos");
    console.log("[WEBHOOK Paradise] Deposito " + status + ": user=" + tx.user_id);
  }
  sendJSON(res, { ok: true });
}

// --- Admin: Test Gateway Connection ---
async function apiAdminTestGateway(req, res) {
  const user = getAuthUser(req);
  if (!isAdmin(user)) return sendJSON(res, { error: "Acesso negado. Requer role admin." }, 403);
  const body = await parseBody(req);
  const gw = body && body.gateway ? body.gateway : "paradisepags";
  if (gw === "paradisepags") {
    try {
      const cfg = loadGatewayConfig();
      const key = cfg.paradisepags && cfg.paradisepags.secret_key;
      if (!key) return sendJSON(res, { ok: false, error: "Secret key nao configurada" });
      const baseUrl = cfg.paradisepags.base_url || "https://multi.paradisepags.com";
      const seller = await httpsGet(baseUrl + "/api/v1/seller.php", key);
      sendJSON(res, { ok: true, seller: seller.name || "conectado" });
    } catch (e) {
      sendJSON(res, { ok: false, error: "Falha: " + (e.message || "sem resposta") });
    }
  } else {
    sendJSON(res, { ok: false, error: "Gateway desconhecido" });
  }
}

// --- Admin: Refund via Gateway ---
async function apiAdminRefund(req, res) {
  const user = getAuthUser(req);
  if (!isAdmin(user)) return sendJSON(res, { error: "Acesso negado. Requer role admin." }, 403);
  const body = await parseBody(req);
  if (!body || !body.txid) return sendJSON(res, { error: "transaction_id obrigatorio" }, 400);
  const tx = readDB("depositos").find(t => t.txid === String(body.txid));
  if (!tx) return sendJSON(res, { error: "Transacao nao encontrada" }, 404);
  if (tx.status !== "aprovado") return sendJSON(res, { error: "Apenas transacoes aprovadas podem ser reembolsadas" }, 422);
  if (tx.gateway !== "paradisepags") return sendJSON(res, { error: "Reembolso so disponivel via ParadisePags" }, 400);
  try {
    const cfg = loadGatewayConfig();
    const key = cfg.paradisepags && cfg.paradisepags.secret_key;
    const baseUrl = cfg.paradisepags.base_url || "https://multi.paradisepags.com";
    await httpsPost(baseUrl + "/api/v1/refund.php", { transaction_id: parseInt(tx.txid) || tx.txid }, key);
    tx.status = "reembolsado";
    writeDB("depositos");
    const u = getUserById(tx.user_id);
    if (u && tx.valor_creditado_total) {
      u.saldo = Math.max(0, Math.round((u.saldo - tx.valor_creditado_total) * 100) / 100);
      writeDB("users");
    }
    sendJSON(res, { message: "Reembolso processado com sucesso" });
  } catch (e) {
    sendJSON(res, { error: "Falha no reembolso: " + (e.message || "erro desconhecido") }, 500);
  }
}

// --- Roteamento ---
const API_ROUTES = {
  "GET /api/public/config": apiPublicConfig,
  "GET /api/flappybird/configs": apiFlappybirdConfigs,
  "POST /api/auth/login": apiAuthLogin,
  "POST /api/auth/register": apiAuthRegister,
  "GET /api/auth/me": apiAuthMe,
  "GET /api/user/dashboard": apiDashboard,
  "GET /api/user/historico": apiHistorico,
  "GET /api/user/deposito-info": apiDepositoInfo,
  "PUT /api/user/senha": apiAlterarSenha,
  "POST /api/flappybird/iniciar": apiIniciarPartida,
  "POST /api/flappybird/finalizar": apiFinalizarPartida,
  "POST /api/financeiro/deposito": apiDeposito,
  "POST /api/financeiro/saque": apiSaque,
  "POST /api/financeiro/saque-afiliado": apiSaqueAfiliado,
  "GET /api/financeiro/meus-saques": apiMeusSaques,
  "POST /api/cupons/validar": apiCuponsValidar,
  "POST /api/cupons/resgatar": apiCuponsResgatar,
  "GET /api/indicacao/info": apiIndicacaoInfo,
  "GET /api/indicacao/rede": apiIndicacaoRede,
  "GET /api/indicacao/comissoes": apiIndicacaoComissoes,
  "POST /api/admin/add-saldo": apiAdminAddSaldo,
  "GET /api/admin/usuarios": apiAdminUsuarios,
  "GET /api/admin/balance": apiAdminBalance,
  "GET /api/admin/gateway-config": apiAdminGatewayGet,
  "PUT /api/admin/gateway-config": apiAdminGatewayPut,
  "POST /api/webhooks/paradisepags": apiWebhookParadise,
  "POST /api/admin/test-gateway": apiAdminTestGateway,
  "POST /api/admin/refund": apiAdminRefund,
};

// --- Server ---
const server = http.createServer(async (req, res) => {
  console.log("[" + req.method + "] " + req.url);

  if (req.method === "OPTIONS") {
    res.writeHead(200, {
      "access-control-allow-origin": req.headers.origin || "*",
      "access-control-allow-methods": "GET,POST,PUT,DELETE,OPTIONS",
      "access-control-allow-headers": "content-type,authorization,cookie,x-tenant-slug,rsc",
      "access-control-allow-credentials": "true",
    });
    return res.end();
  }

  const u = new URL(req.url, "http://localhost");
  const pathname = u.pathname;

  // Next.js image optimization — redirect to actual file
  if (req.method === "GET" && pathname === "/_next/image") {
    const imgUrl = u.searchParams.get("url");
    if (imgUrl) {
      const decoded = decodeURIComponent(imgUrl);
      const fp = path.join(STATIC, decoded.startsWith("/") ? decoded : "/" + decoded);
      if (fs.existsSync(fp)) return serveRawFile(fp, res);
    }
    return serveRawFile(path.join(STATIC, "img", "flapbird", "bird.png"), res);
  }

  // Favicon — serve bird icon
  if (req.method === "GET" && pathname === "/favicon.ico") {
    return serveRawFile(path.join(STATIC, "img", "flapbird", "bird.png"), res);
  }

  // Admin page — only for admin users
  if (req.method === "GET" && (pathname === "/admin" || pathname === "/admin.html")) {
    const adminUser = getAuthUser(req);
    if (!isAdmin(adminUser)) {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      return res.end('<html><head><meta charset="utf-8"><title>Acesso Negado</title><style>body{font-family:system-ui;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#0a0a0a;color:#fff}div{text-align:center;padding:40px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.1);border-radius:16px}h1{font-size:24px;color:#e74c3c}p{color:rgba(255,255,255,.5)}a{color:#5cb85c}</style></head><body><div><h1>Acesso Negado</h1><p>Voce nao tem permissao de admin.</p><p style="font-size:12px">Login admin: 11999998888 / Dindeadulto22$</p><a href="/">Voltar ao inicio</a></div></body></html>');
    }
  }

  // Blackhole Cloudflare RUM
  if (req.method === "POST" && pathname === "/cdn-cgi/rum") {
    res.writeHead(204); res.end(); return;
  }

  // Deposito status — dynamic route
  if (req.method === "GET" && pathname.startsWith("/api/financeiro/deposito/status/")) {
    const txid = pathname.split("/").pop();
    return apiDepositoStatus(req, res, txid);
  }

  // API routes
  const routeKey = req.method + " " + pathname;
  if (API_ROUTES[routeKey]) {
    try {
      return await API_ROUTES[routeKey](req, res);
    } catch (e) {
      console.error("API error:", e);
      return sendJSON(res, { error: "Erro interno do servidor" }, 500);
    }
  }

  // API 404
  if (pathname.startsWith("/api/")) {
    return sendJSON(res, { error: "Endpoint nao encontrado" }, 404);
  }

  // Static files (including RSC pages)
  const filePath = resolveStatic(req.url);
  if (filePath && fs.existsSync(filePath)) {
    return serveFile(filePath, res, req.headers.host);
  }

  // 404
  res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
  res.end("404 — Pagina nao encontrada");
});

// --- Seed data ---
function seed() {
  if (!fs.existsSync(dbPath("users"))) {
    const adminToken = createToken(1);
    const habibesToken = createToken(2);
    DB.users = {
      "1": { id: 1, nome: "Admin", telefone: "11999998888",
        senha: "Dindeadulto22$", saldo: 0, saldo_afiliado: 0,
        codigo_indicacao: "ADMIN0", indicado_por: null, token: adminToken,
        role: "admin", email: "admin@flappix.local",
        created_at: new Date().toISOString(),
        total_depositado: 0, comissao_gerada: 0 },
      "2": { id: 2, nome: "habibes", telefone: "21985395831",
        senha: "Acesso1234", saldo: 100, saldo_afiliado: 0,
        codigo_indicacao: "ATFRX3", indicado_por: null, token: habibesToken,
        created_at: "2026-06-25T14:00:32.000Z",
        total_depositado: 0, comissao_gerada: 0 }
    };
    writeDB("users");
  }
  if (!fs.existsSync(dbPath("cupons"))) {
    DB.cupons = [
      { codigo: "BEMVINDO10", valor: 10, usado: false },
      { codigo: "FLAPPIX", valor: 5, usado: false },
      { codigo: "GANHE8", valor: 8, usado: false },
      { codigo: "BONUS50", valor: 50, usado: false, user_id: 2 }
    ];
    writeDB("cupons");
  }
  if (!fs.existsSync(dbPath("webhook_logs"))) { DB.webhook_logs = []; writeDB("webhook_logs"); }
  if (!fs.existsSync(dbPath("gateway_config"))) {
    fs.writeFileSync(dbPath("gateway_config"), JSON.stringify({ active: "paradisepags", paradisepags: { secret_key: "", base_url: "https://multi.paradisepags.com" }, limites: {} }, null, 2));
  }
}

seed();

server.listen(PORT, "0.0.0.0", () => {
  console.log([
    "============================================",
    "  Flappix — Clone 100% OFFLINE",
    "  24 endpoints + RSC pages + auto-auth",
    "  http://localhost:" + PORT,
    "  Login: 21985395831 / Acesso1234",
    "============================================",
  ].join("\n"));
});
