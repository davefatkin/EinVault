# syntax=docker/dockerfile:1.7

# The node base image is pinned by digest and repeated in every FROM line
# (instead of a single ARG) so Dependabot's docker ecosystem can see and bump
# it — it does not reliably update ARG-indirected references. Dependabot
# updates all four lines together in one PR; keep them identical.
#
# Use the full version tag (26.x.y-alpine), not the floating 26-alpine. For a
# digest pin Dependabot treats the tag as the "version": closing one of its PRs
# ignores that version, and with a floating tag the version never changes, so
# every later digest bump is silently skipped (that is what closed PR #134 did
# to 26-alpine). A full tag moves with each node release, so a closed PR only
# blocks that one release.

# pkgmeta: zero out the version field so version-bump commits don't invalidate
# the npm ci layer in deps; nothing in the install depends on the real version.
FROM node:26.12.1-alpine@sha256:40cd011b55415bc894e45b02fdd5a5dfde056921b7d23a64c74f80497af48797 AS pkgmeta

WORKDIR /meta

COPY package.json package-lock.json ./
RUN node -e "const fs = require('fs'); \
    for (const f of ['package.json', 'package-lock.json']) { \
      const j = JSON.parse(fs.readFileSync(f, 'utf8')); \
      j.version = '0.0.0'; \
      if (j.packages) j.packages[''].version = '0.0.0'; \
      fs.writeFileSync(f, JSON.stringify(j)); \
    }"


# deps
FROM node:26.12.1-alpine@sha256:40cd011b55415bc894e45b02fdd5a5dfde056921b7d23a64c74f80497af48797 AS deps

WORKDIR /build

# Install build deps for better-sqlite3 and sharp native modules
RUN apk add --no-cache python3 make g++

COPY --from=pkgmeta /meta/package.json /meta/package-lock.json ./
# Default-deny install scripts; rebuild only the two native modules that need them.
RUN npm ci --ignore-scripts \
    && npm rebuild better-sqlite3 sharp


# builder
FROM node:26.12.1-alpine@sha256:40cd011b55415bc894e45b02fdd5a5dfde056921b7d23a64c74f80497af48797 AS builder

WORKDIR /build

COPY --from=deps /build/node_modules ./node_modules
COPY . .

ENV NODE_ENV=production
RUN npm run build

# Prune to production deps only (prune preserves compiled native modules)
RUN npm prune --omit=dev


# runner
FROM node:26.12.1-alpine@sha256:40cd011b55415bc894e45b02fdd5a5dfde056921b7d23a64c74f80497af48797 AS runner

WORKDIR /app

# The apk layers below never change text, so BuildKit would reuse them from the
# build cache forever and ship whatever Alpine packages were current when the
# layer was first built. The release workflow passes a fresh value per run so
# these layers (and everything after them in this stage) rebuild every release.
ARG APK_CACHE_BUST=unset

# ffmpeg/ffprobe for optional server-side video transcoding (issue #86). The
# feature is off by default (VIDEO_TRANSCODE unset); the binaries ship anyway so
# operators can enable it by flipping one env var without rebuilding. Alpine's
# ffmpeg includes the native HEVC decoder (reads Apple-recorded source) and
# libx264 for H.264 encode. Adds ~100-150MB to the image.
# tzdata: musl needs zoneinfo for TZ; without it SQLite's 'localtime' stays UTC while Node follows TZ.
RUN echo "apk cache bust: $APK_CACHE_BUST" && apk add --no-cache ffmpeg tzdata

# Pull in OS security fixes published after the pinned base digest. The node
# image only picks these up when the alpine base image itself is rebuilt, which
# does not happen for every Alpine package release, so a digest bump alone is
# not enough. Upgrade everything rather than a hand-kept list so a newly
# flagged base package doesn't need a Dockerfile edit.
RUN apk upgrade --no-cache

# Strip npm, npx, corepack, and the bundled yarn from the runtime image. The
# app starts with `node serve.js` and never invokes a package manager at runtime;
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
COPY --from=builder --chown=node:node /build/serve.js /build/serve-origin.js ./
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
ENV MAX_NOTE_MEDIA=10

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD wget -qO- http://127.0.0.1:3000/api/health || exit 1

# BODY_SIZE_LIMIT is derived from the larger of UPLOAD_MAX_MB and VIDEO_MAX_MB
# so a single request body can carry either an image or a (larger) video.
CMD ["sh", "-c", "if [ \"${VIDEO_MAX_MB:-0}\" -gt \"${UPLOAD_MAX_MB:-0}\" ]; then LIMIT=$VIDEO_MAX_MB; else LIMIT=$UPLOAD_MAX_MB; fi; BODY_SIZE_LIMIT=${LIMIT}M exec node serve.js"]
