# =============================================================================
# Slime Arena App Container
# Multi-stage production build for MetaServer + MatchServer + Client + Admin
# Version: 0.6.0
# Platforms: linux/amd64, linux/arm64
# =============================================================================

# -----------------------------------------------------------------------------
# Stage 1: Builder
# Install dependencies and build all packages
# -----------------------------------------------------------------------------
FROM node:20-alpine AS builder

WORKDIR /app

# Install build dependencies for native modules
RUN apk add --no-cache python3 make g++

# Copy package files first for layer caching
COPY package.json package-lock.json ./
COPY client/package.json client/
COPY server/package.json server/
COPY shared/package.json shared/
COPY admin-dashboard/package.json admin-dashboard/

# Install ALL dependencies (dev deps needed for build)
RUN npm ci

# Copy source code
COPY shared/ shared/
COPY server/ server/
COPY client/ client/
COPY admin-dashboard/ admin-dashboard/
COPY config/ config/
COPY assets-dist/ assets-dist/
COPY version.json ./
COPY scripts/ scripts/

# Build all packages in correct order
# 1. shared (dependency for both server and client)
# 2. server (TypeScript compilation)
# 3. client (Vite production build)
# 4. admin-dashboard (Vite production build)
RUN node scripts/sync-version.js && \
    npm run build --workspace=shared && \
    npm run build --workspace=server && \
    npm run build --workspace=client && \
    npm run build --workspace=admin-dashboard

# Copy SQL migration files (not compiled by tsc)
RUN mkdir -p server/dist/server/src/db/migrations && \
    cp server/src/db/migrations/*.sql server/dist/server/src/db/migrations/

# -----------------------------------------------------------------------------
# Stage 2: Runtime
# Minimal production image
# -----------------------------------------------------------------------------
FROM node:20-alpine AS runtime

# OCI Image Labels
LABEL org.opencontainers.image.title="Slime Arena App"
LABEL org.opencontainers.image.description="Slime Arena game server bundle: MetaServer + MatchServer + Client + Admin Dashboard"
LABEL org.opencontainers.image.vendor="komleff"
LABEL org.opencontainers.image.source="https://github.com/komleff/slime-arena"
LABEL org.opencontainers.image.version="0.6.0"
LABEL org.opencontainers.image.licenses="MIT"

WORKDIR /app

# Set production environment
ENV NODE_ENV=production

# Install production dependencies only
COPY package.json package-lock.json ./
COPY client/package.json client/
COPY server/package.json server/
COPY shared/package.json shared/
COPY admin-dashboard/package.json admin-dashboard/
RUN npm ci --omit=dev

# Copy built artifacts from builder stage
COPY --from=builder /app/shared/dist ./shared/dist
COPY --from=builder /app/server/dist ./server/dist
COPY --from=builder /app/client/dist ./client/dist
COPY --from=builder /app/admin-dashboard/dist ./admin-dashboard/dist
COPY --from=builder /app/admin-dashboard/serve.json ./admin-dashboard/serve.json

# Copy configuration files to root (for meta server)
COPY --from=builder /app/config ./config

# Copy config to server/dist/config (loadBalanceConfig.ts expects it relative to dist)
# Path: server/dist/server/src/config/../../../config = server/dist/config
COPY --from=builder /app/config ./server/dist/config

# Copy package.json files for workspace resolution
COPY --from=builder /app/shared/package.json ./shared/
COPY --from=builder /app/server/package.json ./server/
COPY --from=builder /app/client/package.json ./client/
COPY --from=builder /app/admin-dashboard/package.json ./admin-dashboard/

# Install serve and concurrently for static file hosting and process management
RUN npm install -g serve concurrently

# Expose ports:
# 3000 - MetaServer (HTTP API)
# 2567 - MatchServer (WebSocket/Colyseus)
# 5173 - Client (static files)
# 5175 - Admin Dashboard
EXPOSE 3000 2567 5173 5175

# Health check for MetaServer
HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
    CMD wget -qO- http://localhost:3000/health || exit 1

# Run all services concurrently
# META: MetaServer (HTTP API for auth, profiles, matchmaking)
# MATCH: MatchServer (Colyseus game server)
# CLIENT: Static file server for web client
# ADMIN: Admin Dashboard static server
CMD ["concurrently", \
    "--kill-others", \
    "--names", "META,MATCH,CLIENT,ADMIN", \
    "--prefix-colors", "blue.bold,magenta.bold,green.bold,yellow.bold", \
    "--success", "first", \
    "node server/dist/server/src/meta/server.js", \
    "node server/dist/server/src/index.js", \
    "serve -s client/dist -l 5173 --no-clipboard", \
    "serve admin-dashboard/dist -c admin-dashboard/serve.json -l 5175 --no-clipboard"]
