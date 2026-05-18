# syntax=docker/dockerfile:1.7

ARG NODE_IMAGE=node:24-alpine@sha256:d1b3b4da11eefd5941e7f0b9cf17783fc99d9c6fc34884a665f40a06dbdfc94f

# deps
FROM ${NODE_IMAGE} AS deps

WORKDIR /build

# Install build deps for better-sqlite3 and sharp native modules
RUN apk add --no-cache python3 make g++

COPY package.json package-lock.json ./
# Default-deny install scripts; rebuild only the two native modules that need them.
RUN npm ci --ignore-scripts \
    && npm rebuild better-sqlite3 sharp


# builder
FROM ${NODE_IMAGE} AS builder

WORKDIR /build

COPY --from=deps /build/node_modules ./node_modules
COPY . .

ENV NODE_ENV=production
RUN npm run build

# Prune to production deps only (prune preserves compiled native modules)
RUN npm prune --omit=dev


# runner
FROM ${NODE_IMAGE} AS runner

WORKDIR /app

# Copy only what's needed to run
# node:alpine ships a `node` user at 1000:1000 — reuse it rather than creating a duplicate
COPY --from=builder --chown=node:node /build/build ./build
COPY --from=builder --chown=node:node /build/node_modules ./node_modules
COPY --from=builder --chown=node:node /build/drizzle ./drizzle
COPY --from=builder --chown=node:node /build/package.json ./

# Data directory — will be mounted as a volume
RUN mkdir -p /data && chown node:node /data

USER node

# Expose (internal only — reverse proxy maps the external port)
EXPOSE 3000

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000
ENV DATABASE_URL=/data/einvault.db
ENV UPLOAD_MAX_MB=10
ENV MAX_DAILY_PHOTOS=5

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD wget -qO- http://127.0.0.1:3000/api/health || exit 1

# BODY_SIZE_LIMIT is derived from UPLOAD_MAX_MB so users only set one value.
CMD ["sh", "-c", "BODY_SIZE_LIMIT=${UPLOAD_MAX_MB}M exec node build"]
