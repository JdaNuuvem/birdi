# ─── Flappix Clone — Dockerfile ───────────────────────────────────────────────
# Imagem enxuta: usa node:22-alpine, zero npm install (stdlib only)
# ────────────────────────────────────────────────────────────────────────────────

FROM node:22-alpine

# Seguranca: roda como non-root
RUN addgroup -S app && adduser -S app -G app

WORKDIR /app

# Copia apenas o necessario — tudo servido via static/ + raiz
COPY package.json ./
COPY clone-offline.js ./
COPY static/ ./static/
COPY *.html ./
COPY *.css ./

# Dados persistentes em volume
RUN mkdir -p /app/data && chown -R app:app /app/data

# Porta exposta (Coolify usa PORT env var)
EXPOSE 8000

USER app

ENV NODE_ENV=production

CMD ["node", "clone-offline.js"]
