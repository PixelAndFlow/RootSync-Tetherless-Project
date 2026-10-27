# Tetherless API image. Build from the repository root:
#   docker compose build api
FROM node:22-alpine

WORKDIR /app

# Install the one runtime dependency (pg) first so code changes don't redo it.
COPY packages/server/package.json packages/server/
RUN cd packages/server && npm install --omit=dev --no-audit --no-fund

COPY packages/contract packages/contract
COPY packages/content packages/content
COPY packages/analytics packages/analytics
COPY packages/server packages/server
COPY content content

ENV NODE_ENV=production \
    PORT=8080 \
    CONTENT_DIR=/app/content/modules

USER node
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD wget -qO- http://127.0.0.1:8080/healthz || exit 1
CMD ["node", "packages/server/src/main.ts"]
