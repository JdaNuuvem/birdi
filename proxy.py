"""
Proxy server — mirrors https://canarinhodacopa.fun/ e injeta banner de prova.
Uso: python proxy.py  (depois abra http://localhost:8000)
"""
import http.server, urllib.request, urllib.error, ssl, re, socketserver, os

PORT = 8000
TARGET = "https://canarinhodacopa.fun"
BANNER = """
<div id="banner-prova" style="position:fixed;top:0;left:0;right:0;z-index:99999;background:linear-gradient(135deg,#f00,#c00);color:#fff;text-align:center;padding:10px 20px;font-size:20px;font-weight:900;letter-spacing:2px;text-transform:uppercase;box-shadow:0 4px 20px rgba(255,0,0,.5);border-bottom:3px solid #f44;animation:pulse-banner 2s ease-in-out infinite;line-height:1.4">
⚠️ PROVA DE TESTES — 25/06/2026 ⚠️
<small style="display:block;font-size:11px;font-weight:400;letter-spacing:1px;opacity:.9;margin-top:2px">Clone para análise de segurança — Ambiente controlado</small>
</div>
<style>@keyframes pulse-banner{0%,100%{opacity:1}50%{opacity:.85}}body{margin-top:56px!important}header,main>header,[class*=header]{top:56px!important}</style>
"""

# Configura o contexto SSL para ignorar verificação de certificado
ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE

class ProxyHandler(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        self._proxy("GET")

    def do_POST(self):
        length = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(length) if length else None
        self._proxy("POST", body)

    def do_PUT(self):
        length = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(length) if length else None
        self._proxy("PUT", body)

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET,POST,PUT,OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "*")
        self.end_headers()

    def _proxy(self, method, body=None):
        url = TARGET + self.path
        if self.headers.get("Host"):
            url = url  # keep as is

        try:
            req = urllib.request.Request(url, data=body, method=method)

            # Copy relevant headers from client
            forward_headers = [
                "accept", "accept-encoding", "accept-language",
                "authorization", "cache-control", "content-type",
                "cookie", "referer", "user-agent", "x-tenant-slug",
                "x-forwarded-for", "x-real-ip", "rsc"
            ]
            for h in forward_headers:
                val = self.headers.get(h)
                if val:
                    req.add_header(h, val)

            # Set host to target
            req.add_header("Host", "canarinhodacopa.fun")

            # Fetch from target
            resp = urllib.request.urlopen(req, context=ctx, timeout=30)

            content_type = resp.headers.get("Content-Type", "")
            content = resp.read()
            status = resp.status

            # Inject banner into HTML responses
            if "text/html" in content_type:
                text = content.decode("utf-8", errors="replace")
                # Inject banner after <body> tag
                text = text.replace("<body", BANNER + "<body", 1)
                # Fix absolute URLs to use proxy
                text = text.replace('src="/', 'src="http://localhost:' + str(PORT) + '/')
                text = text.replace('href="/', 'href="http://localhost:' + str(PORT) + '/')
                # Fix Next.js RSC links
                text = text.replace('"/', '"http://localhost:' + str(PORT) + '/')
                # But don't break http(s) URLs
                text = re.sub(r'(?<!"http)(?<!"https)("http://localhost:' + str(PORT) + '/)', r'"http://localhost:' + str(PORT) + '/', text)
                # Actually just do the replacement more carefully
                text = re.sub(
                    r'(src|href|action)="(?!https?://)(?!data:)(/)',
                    r'\1="http://localhost:' + str(PORT) + r'\2',
                    text
                )
                content = text.encode("utf-8")

            self.send_response(status)
            # Copy response headers
            for key, val in resp.headers.items():
                if key.lower() not in ("transfer-encoding", "content-encoding", "content-length"):
                    self.send_header(key, val)
            self.send_header("Content-Length", str(len(content)))
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(content)

        except urllib.error.HTTPError as e:
            self.send_response(e.code)
            self.end_headers()
            try:
                self.wfile.write(e.read())
            except:
                pass
        except Exception as e:
            print(f"Proxy error: {e}")
            self.send_response(502)
            self.end_headers()
            self.wfile.write(f"Proxy error: {e}".encode())

    def log_message(self, format, *args):
        print(f"[proxy] {self.command} {self.path}")

if __name__ == "__main__":
    print(f"""
╔══════════════════════════════════════════╗
║   🐦 Flap Copa — Clone Proxy           ║
║   Mirroing: {TARGET}  ║
║   Local:    http://localhost:{PORT}         ║
╚══════════════════════════════════════════╝
""")
    server = socketserver.ThreadingTCPServer(("", PORT), ProxyHandler)
    server.serve_forever()
