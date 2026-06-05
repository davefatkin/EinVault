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

# ffmpeg/ffprobe for optional server-side video transcoding (issue #86). The
# feature is off by default (VIDEO_TRANSCODE unset); the binaries ship anyway so
# operators can enable it by flipping one env var without rebuilding. Alpine's
# ffmpeg includes the native HEVC decoder (reads Apple-recorded source) and
# libx264 for H.264 encode. Adds ~100-150MB to the image.
RUN apk add --no-cache ffmpeg

# Strip npm, npx, corepack, and the bundled yarn from the runtime image. The
# app starts with `node build` and never invokes a package manager at runtime;
# keeping them adds attack surface and CVE noise (npm's transitives, etc.).
RUN rm -rf \
    /usr/local/lib/node_modules/npm \
    /usr/local/lib/node_modules/corepack \
    /usr/local/bin/npm \
    /usr/local/bin/npx \
    /usr/local/bin/corepack \
    /usr/local/bin/yarn \
    /usr/local/bin/yarnpkg \
    /opt/yarn-*

# Copy only what's needed to run
# node:alpine ships a `node` user at 1000:1000, reuse it rather than creating a duplicate
COPY --from=builder --chown=node:node /build/build ./build
COPY --from=builder --chown=node:node /build/node_modules ./node_modules
COPY --from=builder --chown=node:node /build/drizzle ./drizzle
COPY --from=builder --chown=node:node /build/package.json ./

# Data directory, mounted as a volume in production
RUN mkdir -p /data && chown node:node /data

USER node

# Expose (internal only — reverse proxy maps the external port)
EXPOSE 3000

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000
ENV DATABASE_URL=/data/einvault.db
ENV UPLOAD_MAX_MB=10
ENV VIDEO_MAX_MB=100
ENV MAX_DAILY_MEDIA=5

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD wget -qO- http://127.0.0.1:3000/api/health || exit 1

# BODY_SIZE_LIMIT is derived from the larger of UPLOAD_MAX_MB and VIDEO_MAX_MB
# so a single request body can carry either an image or a (larger) video.
CMD ["sh", "-c", "if [ \"${VIDEO_MAX_MB:-0}\" -gt \"${UPLOAD_MAX_MB:-0}\" ]; then LIMIT=$VIDEO_MAX_MB; else LIMIT=$UPLOAD_MAX_MB; fi; BODY_SIZE_LIMIT=${LIMIT}M exec node build"]
