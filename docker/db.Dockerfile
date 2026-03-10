# =============================================================================
# Slime Arena DB Container
# PostgreSQL + Redis in one container
# Version: 0.2.0
# Platforms: linux/amd64, linux/arm64
# =============================================================================

FROM alpine:3.19

# OCI Image Labels
LABEL org.opencontainers.image.title="Slime Arena DB"
LABEL org.opencontainers.image.description="Slime Arena database bundle: PostgreSQL 16 + Redis"
LABEL org.opencontainers.image.vendor="komleff"
LABEL org.opencontainers.image.source="https://github.com/komleff/slime-arena"
LABEL org.opencontainers.image.version="0.2.0"
LABEL org.opencontainers.image.licenses="MIT"

# Install PostgreSQL, Redis, supervisord, and utilities
RUN apk add --no-cache \
    postgresql16 \
    postgresql16-contrib \
    redis \
    supervisor \
    su-exec

# Setup PostgreSQL directories
ENV PGDATA=/var/lib/postgresql/data
RUN mkdir -p /var/lib/postgresql/data /run/postgresql /var/log && \
    chown -R postgres:postgres /var/lib/postgresql /run/postgresql && \
    chmod 700 /var/lib/postgresql/data

# Setup Redis directories
RUN mkdir -p /var/lib/redis && \
    chown redis:redis /var/lib/redis

# Copy supervisord config
COPY docker/supervisord-db.conf /etc/supervisord.conf

# Copy entrypoint script and fix line endings (Windows CRLF -> Unix LF)
COPY docker/entrypoint-db.sh /entrypoint.sh
RUN sed -i 's/\r$//' /entrypoint.sh && chmod +x /entrypoint.sh

# Copy seed data for initial database population
RUN mkdir -p /docker-entrypoint-initdb.d
COPY docker/seed-data.sql /docker-entrypoint-initdb.d/seed-data.sql

# Expose ports:
# 5432 - PostgreSQL
# 6379 - Redis
EXPOSE 5432 6379

# Health check for PostgreSQL
HEALTHCHECK --interval=10s --timeout=5s --start-period=30s --retries=3 \
    CMD pg_isready -U postgres -h localhost || exit 1

# Volumes for data persistence
VOLUME ["/var/lib/postgresql/data", "/var/lib/redis"]

# Environment variables with defaults
ENV POSTGRES_USER=slime \
    POSTGRES_PASSWORD=slime_dev_password \
    POSTGRES_DB=slime_arena

# Run entrypoint script
ENTRYPOINT ["/entrypoint.sh"]
