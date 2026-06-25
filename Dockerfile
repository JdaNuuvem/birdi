# ─── Flappix Clone — Dockerfile ───────────────────────────────────────────────
# Imagem enxuta: usa node:22-alpine, zero npm install (stdlib only)
# ────────────────────────────────────────────────────────────────────────────────

FROM node:22-alpine

WORKDIR /app

# Copia apenas o necessario — tudo servido via static/ + raiz
COPY package.json ./
COPY clone-offline.js ./
COPY static/ ./static/
COPY *.html ./
COPY *.css ./

# Dados persistentes em volume
RUN mkdir -p /app/data

# Porta exposta (Coolify usa PORT env var)
EXPOSE 8000

ENV NODE_ENV=production

CMD ["node", "clone-offline.js"]
