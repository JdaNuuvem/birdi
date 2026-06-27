// test-analytics.js — testes unitarios para o sistema de analytics
// Uso: node test-analytics.js
// ponytail: sem frameworks, assert puro + http, um arquivo so
"use strict";

const http = require("http");
const { spawn } = require("child_process");
const path = require("path");

const TEST_PORT = 8001;
const DIR = __dirname;
let serverProc = null;
let passed = 0;
let failed = 0;

function assert(cond, label) {
  if (cond) { passed++; return true; }
  console.error("  FAIL: " + label);
  failed++;
  return false;
}

function post(path, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const opts = {
      hostname: "localhost", port: TEST_PORT, path,
      method: "POST",
      headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(data), ...headers },
      timeout: 5000,
    };
    const req = http.request(opts, res => {
      const chunks = [];
      res.on("data", c => chunks.push(c));
      res.on("end", () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(Buffer.concat(chunks).toString()) }); }
        catch (e) { resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString() }); }
      });
    });
    req.on("error", reject);
    req.on("timeout", () => { req.destroy(); reject(new Error("Timeout")); });
    req.write(data);
    req.end();
  });
}

function get(path, headers = {}) {
  return new Promise((resolve, reject) => {
    const opts = {
      hostname: "localhost", port: TEST_PORT, path,
      method: "GET",
      headers,
      timeout: 5000,
    };
    const req = http.request(opts, res => {
      const chunks = [];
      res.on("data", c => chunks.push(c));
      res.on("end", () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(Buffer.concat(chunks).toString()) }); }
        catch (e) { resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString() }); }
      });
    });
    req.on("error", reject);
    req.on("timeout", () => { req.destroy(); reject(new Error("Timeout")); });
    req.end();
  });
}

function makeToken(userId) {
  const payload = JSON.stringify({ userId, tid: "cliente22", iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 604800 });
  return Buffer.from(payload).toString("base64");
}

const ADMIN_TOKEN = makeToken(1);
const USER_TOKEN = makeToken(2);
const AUTH = { Authorization: "Bearer " + ADMIN_TOKEN };
const USER_AUTH = { Authorization: "Bearer " + USER_TOKEN };

async function runTests() {
  console.log("=== Testes de Analytics ===\n");

  // ── 1. POST /api/analytics/event — autenticacao ──
  console.log("[1] Autenticacao no evento");
  {
    const r = await post("/api/analytics/event", { type: "pageview" });
    assert(r.status === 401, "sem token → 401");
    assert(r.body && r.body.error, "sem token → mensagem de erro");
  }
  {
    const r = await post("/api/analytics/event", { type: "pageview" }, AUTH);
    assert(r.status === 200, "com token admin → 200");
    assert(r.body && r.body.ok === true, "com token admin → ok");
  }
  console.log("");

  // ── 2. POST /api/analytics/event — validacao de campos ──
  console.log("[2] Validacao de campos no evento");
  {
    const r = await post("/api/analytics/event", {}, AUTH);
    assert(r.status === 400, "sem type → 400");
  }
  {
    const r = await post("/api/analytics/event", { type: "click", page: "/jogar", detail: "botao play" }, AUTH);
    assert(r.status === 200, "click completo → 200");
  }
  {
    const r = await post("/api/analytics/event", { type: "deposit", detail: "R$50" }, AUTH);
    assert(r.status === 200, "deposit → 200");
  }
  console.log("");

  // ── 3. Truncamento de campos (page e detail) ──
  console.log("[3] Truncamento de page e detail");
  {
    const longPage = "/" + "x".repeat(200);
    const longDetail = "y".repeat(400);
    await post("/api/analytics/event", { type: "pageview", page: longPage, detail: longDetail }, AUTH);
    // aguarda flush
    await new Promise(r => setTimeout(r, 10100));
    const dash = await get("/api/analytics/dashboard", AUTH);
    assert(dash.status === 200, "dashboard carregou apos flush");
    const last = dash.body.recent.find(e => e.type === "pageview" && e.detail.startsWith("y"));
    assert(last && last.page.length <= 128, "page truncado em 128 chars → " + (last ? last.page.length : "N/A"));
    assert(last && last.detail.length <= 256, "detail truncado em 256 chars → " + (last ? last.detail.length : "N/A"));
  }
  console.log("");

  // ── 4. XSS — payloads armazenados mas dashboard tem esc() para neutralizar ──
  console.log("[4] Protecao XSS — funcao esc() presente e payloads armazenados");
  {
    // injeta payloads
    const payloadPage = "/<img src=x onerror=alert(1)>";
    const payloadDetail = "<script>evil()</script>";
    await post("/api/analytics/event", { type: "pageview", page: payloadPage, detail: payloadDetail }, AUTH);
    await new Promise(r => setTimeout(r, 10100));

    // verifica que payloads foram ARMAZENADOS (confirmando vetor de injecao)
    const dash = await get("/api/analytics/dashboard", AUTH);
    const stored = dash.body.recent.find(e => e.type === "pageview" && e.page === payloadPage);
    assert(stored && stored.detail === payloadDetail, "payloads armazenados no DB (vetor de injecao confirmado)");

    // verifica que o dashboard HTML contem a funcao esc() que neutraliza no cliente
    const html = await new Promise((resolve, reject) => {
      http.request({ hostname: "localhost", port: TEST_PORT, path: "/analytics", method: "GET", headers: AUTH, timeout: 5000 }, res => {
        const chunks = [];
        res.on("data", c => chunks.push(c));
        res.on("end", () => resolve(Buffer.concat(chunks).toString()));
      }).on("error", reject).end();
    });
    assert(html.includes("function esc("), "funcao esc() presente no dashboard");
    assert(html.includes("replace(/&/g,'&amp;')"), "esc() escapa &");
    assert(html.includes("replace(/</g,'&lt;')"), "esc() escapa <");
    assert(html.includes("replace(/>/g,'&gt;')"), "esc() escapa >");

    // verifica que esc() e usada nas renderizacoes (nao ha innerHTML sem esc)
    assert(html.includes("esc(e.detail||'-')"), "detail render usa esc()");
    assert(html.includes("esc(r.element||'?')"), "elemento render usa esc()");
    assert(html.includes("esc(p)"), "pageName fallback usa esc()");
    assert(html.includes("esc(e.user||'anon')"), "user render usa esc()");
  }
  console.log("");

  // ── 5. GET /api/analytics/dashboard — autenticacao ──
  console.log("[5] Dashboard — controle de acesso");
  {
    const r = await get("/api/analytics/dashboard");
    assert(r.status === 401 || r.status === 403, "sem token → bloqueado");
  }
  {
    const r = await get("/api/analytics/dashboard", USER_AUTH);
    assert(r.status === 403, "usuario normal → 403");
  }
  {
    const r = await get("/api/analytics/dashboard", AUTH);
    assert(r.status === 200, "admin → 200");
    assert(typeof r.body.total_pageviews === "number", "total_pageviews e numero");
    assert(typeof r.body.total_clicks === "number", "total_clicks e numero");
    assert(typeof r.body.total_deposits === "number", "total_deposits e numero");
    assert(typeof r.body.unique_users === "number", "unique_users e numero");
    assert(Array.isArray(r.body.pageviews), "pageviews e array");
    assert(Array.isArray(r.body.interactions), "interactions e array");
    assert(Array.isArray(r.body.recent), "recent e array");
  }
  console.log("");

  // ── 6. Dashboard — agregacao correta ──
  console.log("[6] Dashboard — agregacao de dados");
  {
    // flush buffer ate aqui
    await new Promise(r => setTimeout(r, 10100));
    const r = await get("/api/analytics/dashboard", AUTH);
    const total = r.body.pageviews.reduce((s, p) => s + p.count, 0);
    assert(total === r.body.total_pageviews, "total_pageviews bate com soma de pageviews");
    assert(r.body.total_clicks >= 0, "total_clicks nao-negativo");
    assert(r.body.total_deposits >= 0, "total_deposits nao-negativo");
    assert(r.body.recent.length <= 50, "recent limitado a 50");
  }
  console.log("");

  // ── 7. /analytics — pagina HTML ──
  console.log("[7] Pagina /analytics");
  {
    const html = await new Promise((resolve, reject) => {
      http.request({ hostname: "localhost", port: TEST_PORT, path: "/analytics", method: "GET", headers: AUTH, timeout: 5000 }, res => {
        const chunks = [];
        res.on("data", c => chunks.push(c));
        res.on("end", () => resolve(Buffer.concat(chunks).toString()));
      }).on("error", reject).end();
    });
    assert(html.includes("Painel Analitico"), "titulo presente");
    assert(html.includes("total-pageviews"), "card de pageviews presente");
    assert(html.includes("total-clicks"), "card de clicks presente");
    assert(html.includes("total-deposits"), "card de depositos presente");
    assert(html.includes("unique-users"), "card de unique users presente");
    assert(!html.includes("__analytics_loaded"), "tracking script NAO injetado no dashboard");
  }
  console.log("");

  // ── 8. /analytics — sem auth bloqueia ──
  console.log("[8] Pagina /analytics sem auth");
  {
    const html = await new Promise((resolve, reject) => {
      http.request({ hostname: "localhost", port: TEST_PORT, path: "/analytics", method: "GET", timeout: 5000 }, res => {
        const chunks = [];
        res.on("data", c => chunks.push(c));
        res.on("end", () => resolve(Buffer.concat(chunks).toString()));
      }).on("error", reject).end();
    });
    assert(html.includes("Acesso Negado"), "bloqueia acesso sem auth");
    assert(!html.includes("Painel Analitico"), "dashboard nao vaza sem auth");
  }
  console.log("");

  // ── 9. Buffer flush — eventos sao persistidos ──
  console.log("[9] Buffer flush — persistencia");
  {
    // envia evento, NAO espera flush, verifica que ainda nao esta no dashboard
    await post("/api/analytics/event", { type: "pageview", page: "/test-buffer", detail: "antes-flush" }, AUTH);
    // sem esperar flush, o evento ainda deve estar no buffer (nao visivel)
    // mas como o dashboard le do DB (que so e escrito no flush), o evento recente nao deve aparecer
    // porem o buffer flush periodico pode ter rodado antes de chegarmos aqui
    // entao forca um flush esperando
    await new Promise(r => setTimeout(r, 10100));
    const r = await get("/api/analytics/dashboard", AUTH);
    const found = r.body.recent.some(e => e.page === "/test-buffer");
    assert(found, "evento /test-buffer visivel apos flush");
  }
  console.log("");

  // ── 10. Tipos de evento invalidos ──
  console.log("[10] Tipos de evento edge cases");
  {
    const r = await post("/api/analytics/event", { type: "" }, AUTH);
    assert(r.status === 400, "type vazio → 400 (tratado como falsy na checagem)");
    // NOTA: type vazio string e truthy em JS, entao passa pela checagem !body.type
    // body.type="" → !"" → true → 400. OK.
  }
  {
    const longType = "x".repeat(50);
    const r = await post("/api/analytics/event", { type: longType }, AUTH);
    assert(r.status === 200, "type longo → 200 (sem validacao de tamanho)");
  }
  console.log("");

  // ── 11. Evento sem page e detail (defaults) ──
  console.log("[11] Evento com defaults");
  {
    const r = await post("/api/analytics/event", { type: "pageview" }, AUTH);
    assert(r.status === 200, "apenas type → 200");
    await new Promise(r2 => setTimeout(r2, 10100));
    const dash = await get("/api/analytics/dashboard", AUTH);
    const last = dash.body.recent[0];
    assert(last && last.page === "/", "page default → /");
    assert(last && last.detail === "", "detail default → vazio");
  }
  console.log("");

  // ── RESULTADO ──
  console.log("============================================");
  console.log("  Passed: " + passed);
  console.log("  Failed: " + failed);
  console.log("============================================");
  if (failed > 0) process.exitCode = 1;
  else console.log("  TODOS OS TESTES PASSARAM.");
}

// ── Inicia servidor ──
function startServer() {
  return new Promise((resolve, reject) => {
    const env = Object.assign({}, process.env, { PORT: String(TEST_PORT), DATA_DIR: path.join(DIR, "data") });
    serverProc = spawn("node", [path.join(DIR, "clone-offline.js")], { env, stdio: ["ignore", "pipe", "pipe"] });
    let started = false;
    const timeout = setTimeout(() => { if (!started) { serverProc.kill(); reject(new Error("Server timeout")); } }, 15000);

    serverProc.stdout.on("data", (d) => {
      const s = d.toString();
      if (!started && s.includes("localhost:" + TEST_PORT)) {
        started = true;
        clearTimeout(timeout);
        setTimeout(resolve, 500); // pequeno delay para garantir
      }
    });
    serverProc.stderr.on("data", (d) => { /* console.error("[server]", d.toString().trim()); */ });
    serverProc.on("error", reject);
    serverProc.on("exit", (code) => { if (!started) { clearTimeout(timeout); reject(new Error("Server exited early: " + code)); } });
  });
}

async function main() {
  try {
    // limpa analytics antes do teste
    const fs = require("fs");
    const analyticsPath = path.join(DIR, "data", "analytics.json");
    fs.writeFileSync(analyticsPath, "[]");
    // remove o in-memory cache do DB se o servidor anterior deixou
    // como e processo novo, o cache comeca limpo

    console.log("Iniciando servidor na porta " + TEST_PORT + "...");
    await startServer();
    console.log("Servidor pronto.\n");

    await runTests();
  } catch (e) {
    console.error("ERRO FATAL:", e.message);
    process.exitCode = 1;
  } finally {
    if (serverProc) { serverProc.kill(); serverProc = null; }
    process.exit();
  }
}

main();
