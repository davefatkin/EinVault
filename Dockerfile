# syntax=docker/dockerfile:1.7

# deps
FROM node:24-alpine AS deps

WORKDIR /build

# Install build deps for better-sqlite3 and sharp native modules
RUN apk add --no-cache python3 make g++

COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts=false


# builder
FROM node:24-alpine AS builder

WORKDIR /build

COPY --from=deps /build/node_modules ./node_modules
COPY . .

# Generate Drizzle migrations before build
RUN npm run db:generate

ENV NODE_ENV=production
RUN npm run build

# Prune to production deps only (prune preserves compiled native modules)
RUN npm prune --omit=dev


# runner
FROM node:24-alpine AS runner

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

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD wget -qO- http://127.0.0.1:3000/api/health || exit 1

# BODY_SIZE_LIMIT is derived from UPLOAD_MAX_MB so users only set one value.
CMD ["sh", "-c", "BODY_SIZE_LIMIT=${UPLOAD_MAX_MB}M exec node build"]
