# OPEN ITEM (F-OPS-001, partially closed): this is still a floating tag. Pinning it by digest
# requires resolving `node:22-alpine` against a container registry, which the audit sandbox
# cannot reach (hub.docker.com and registry-1.docker.io both fail TLS). A digest written here
# without that lookup would be invented, so it is deliberately left for whoever can run:
#   docker buildx imagetools inspect node:22-alpine
# and paste the real `RepoDigests` sha256 below.
FROM node:22-alpine

ENV NODE_ENV=production
WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY src ./src
# The startup migration runner reads numbered SQL files from /app/db.
COPY db ./db

EXPOSE 8080

# Busybox wget is present in the alpine base; a container whose migrations failed must not
# receive traffic.
HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=5 \
  CMD wget -qO- http://127.0.0.1:8080/health || exit 1

USER node
CMD ["sh", "-c", "npm run migrate && npm start"]
