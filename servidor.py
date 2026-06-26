# Servidor local para o clone do Flap Copa
# Uso: python servidor.py
# Depois abra http://localhost:8000

import http.server
import socketserver
import os

PORT = 8000
DIR = os.path.dirname(os.path.abspath(__file__))

class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIR, **kwargs)

with socketserver.TCPServer(("", PORT), Handler) as httpd:
    print(f"Servidor rodando em http://localhost:{PORT}")
    print("Pressione Ctrl+C para parar")
    httpd.serve_forever()
