# =============================================================================
# Slime Arena Monolith Full Container
# All-in-One: PostgreSQL + Redis + MetaServer + MatchServer + Client
# Version: 0.1.0
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

# Build all packages in correct order
# 1. shared (dependency for both server and client)
# 2. server (TypeScript compilation)
# 3. client (Vite production build)
# 4. admin-dashboard (Vite production build)
RUN npm run build --workspace=shared && \
    npm run build --workspace=server && \
    npm run build --workspace=client && \
    npm run build --workspace=admin-dashboard

# Copy SQL migration files (not compiled by tsc)
RUN mkdir -p server/dist/server/src/db/migrations && \
    cp server/src/db/migrations/*.sql server/dist/server/src/db/migrations/

# -----------------------------------------------------------------------------
# Stage 2: Runtime
# Full production image with PostgreSQL, Redis, and Application
# -----------------------------------------------------------------------------
FROM node:20-alpine AS runtime

# OCI Image Labels
LABEL org.opencontainers.image.title="Slime Arena Monolith Full"
LABEL org.opencontainers.image.description="Slime Arena all-in-one container: PostgreSQL + Redis + MetaServer + MatchServer + Client + Admin Dashboard"
LABEL org.opencontainers.image.vendor="komleff"
LABEL org.opencontainers.image.source="https://github.com/komleff/slime-arena"
LABEL org.opencontainers.image.version="0.1.0"
LABEL org.opencontainers.image.licenses="MIT"

WORKDIR /app

# Install PostgreSQL, Redis, supervisord, and utilities
RUN apk add --no-cache \
    postgresql16 \
    postgresql16-contrib \
    redis \
    supervisor \
    su-exec \
    wget

# Create node user if not exists (for running app processes)
RUN id -u node &>/dev/null || adduser -D -u 1000 node

# Setup PostgreSQL directories
ENV PGDATA=/var/lib/postgresql/data
RUN mkdir -p /var/lib/postgresql/data /run/postgresql /var/log && \
    chown -R postgres:postgres /var/lib/postgresql /run/postgresql && \
    chmod 700 /var/lib/postgresql/data

# Setup Redis directories
RUN mkdir -p /var/lib/redis && \
    chown redis:redis /var/lib/redis

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
COPY --from=builder /app/config ./server/dist/config

# Copy package.json files for workspace resolution
COPY --from=builder /app/shared/package.json ./shared/
COPY --from=builder /app/server/package.json ./server/
COPY --from=builder /app/client/package.json ./client/
COPY --from=builder /app/admin-dashboard/package.json ./admin-dashboard/

# Install serve globally for static file hosting
RUN npm install -g serve

# Copy supervisord config
COPY docker/supervisord.conf /etc/supervisord.conf

# Copy entrypoint script and fix line endings (Windows CRLF -> Unix LF)
COPY docker/entrypoint-full.sh /entrypoint.sh
RUN sed -i 's/\r$//' /entrypoint.sh && chmod +x /entrypoint.sh

# Copy seed data for initial database population
RUN mkdir -p /docker-entrypoint-initdb.d
COPY docker/seed-data.sql /docker-entrypoint-initdb.d/seed-data.sql

# Expose ports:
# 3000 - MetaServer (HTTP API)
# 2567 - MatchServer (WebSocket/Colyseus)
# 5173 - Client (static files)
# 5175 - Admin Dashboard
EXPOSE 3000 2567 5173 5175

# Health check for MetaServer
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
    CMD wget -qO- http://localhost:3000/health || exit 1

# Volumes for data persistence
VOLUME ["/var/lib/postgresql/data", "/var/lib/redis"]

# Run entrypoint script
ENTRYPOINT ["/entrypoint.sh"]
