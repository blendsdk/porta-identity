#!/bin/sh
set -e

# ──────────────────────────────────────────────
# Porta Docker Entrypoint
#
# Routes to the correct service based on PORTA_SERVICE:
#   server (default) — Porta OIDC Server
#   admin            — Porta Admin GUI (BFF + React SPA)
#
# Environment variables:
#   PORTA_SERVICE       — Which service to run: server | admin (default: server)
#   PORTA_WAIT_TIMEOUT  — Max seconds to wait for services (default: 60)
#   PORTA_AUTO_MIGRATE  — Run migrations on startup when "true" (default: false)
#   DATABASE_URL        — PostgreSQL connection string
#   REDIS_URL           — Redis connection string
# ──────────────────────────────────────────────

PORTA_SERVICE="${PORTA_SERVICE:-server}"
WAIT_TIMEOUT="${PORTA_WAIT_TIMEOUT:-60}"
AUTO_MIGRATE="${PORTA_AUTO_MIGRATE:-false}"

# ──────────────────────────────────────────────
# Wait for Redis (needed by both server and admin)
# ──────────────────────────────────────────────
if [ -n "$REDIS_URL" ]; then
  echo "⏳ Waiting for Redis..."

  # Extract host and port from REDIS_URL
  # Supports: redis://host:port or redis://host:port/db
  REDIS_HOST=$(echo "$REDIS_URL" | sed -n 's|redis://\([^:/]*\).*|\1|p')
  REDIS_PORT=$(echo "$REDIS_URL" | sed -n 's|redis://[^:]*:\([0-9]*\).*|\1|p')
  REDIS_PORT="${REDIS_PORT:-6379}"

  elapsed=0
  until nc -z "$REDIS_HOST" "$REDIS_PORT" 2>/dev/null; do
    elapsed=$((elapsed + 1))
    if [ "$elapsed" -ge "$WAIT_TIMEOUT" ]; then
      echo "❌ Redis at ${REDIS_HOST}:${REDIS_PORT} not ready after ${WAIT_TIMEOUT}s — aborting"
      exit 1
    fi
    sleep 1
  done
  echo "✅ Redis is ready (${REDIS_HOST}:${REDIS_PORT})"
fi

# ──────────────────────────────────────────────
# Service routing
# ──────────────────────────────────────────────
case "$PORTA_SERVICE" in
  server)
    # ── Porta OIDC Server ──────────────────────
    # Wait for PostgreSQL (only needed by server)
    if [ -n "$DATABASE_URL" ]; then
      echo "⏳ Waiting for PostgreSQL..."

      # Extract host and port from DATABASE_URL
      # Supports: postgresql://user:pass@host:port/db
      DB_HOST=$(echo "$DATABASE_URL" | sed -n 's|.*@\([^:/]*\).*|\1|p')
      DB_PORT=$(echo "$DATABASE_URL" | sed -n 's|.*@[^:]*:\([0-9]*\)/.*|\1|p')
      DB_PORT="${DB_PORT:-5432}"

      elapsed=0
      until nc -z "$DB_HOST" "$DB_PORT" 2>/dev/null; do
        elapsed=$((elapsed + 1))
        if [ "$elapsed" -ge "$WAIT_TIMEOUT" ]; then
          echo "❌ PostgreSQL at ${DB_HOST}:${DB_PORT} not ready after ${WAIT_TIMEOUT}s — aborting"
          exit 1
        fi
        sleep 1
      done
      echo "✅ PostgreSQL is ready (${DB_HOST}:${DB_PORT})"
    fi

    # Optional: Auto-run database migrations
    if [ "$AUTO_MIGRATE" = "true" ]; then
      echo "🔄 Running database migrations..."
      node dist/cli/index.js migrate up
      echo "✅ Migrations complete"
    fi

    echo "🚀 Starting Porta OIDC Server..."
    exec node dist/index.js
    ;;

  admin)
    # ── Porta Admin GUI (BFF) ──────────────────
    echo "🖥️  Starting Porta Admin GUI..."
    exec node admin-gui/dist/server/index.js
    ;;

  *)
    echo "❌ Unknown PORTA_SERVICE: $PORTA_SERVICE"
    echo "   Expected: server, admin"
    exit 1
    ;;
esac
