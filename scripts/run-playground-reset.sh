#!/bin/bash
set -e

# Porta Playground Reset Script
#
# Drops the database schema, re-runs migrations and seed data.
# Docker services must be running. Use after schema changes or
# when you want a completely fresh playground state.
#
# Usage: yarn playground:reset

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

cd "$PROJECT_DIR"

echo "🔄 Resetting playground data..."

# Stop running Porta/playground processes (ignore errors if not running)
bash scripts/run-playground-stop.sh 2>/dev/null || true

# Drop and recreate the public schema (wipes all tables)
echo "[1/3] Resetting database..."
docker compose -f docker/docker-compose.yml exec -T postgres \
  psql -U porta -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;" porta
echo "  ✅ Database reset"

# Flush Redis cache (stale org/client/user data from previous seed)
echo "[2/3] Flushing Redis cache..."
docker compose -f docker/docker-compose.yml exec -T redis redis-cli FLUSHDB
echo "  ✅ Redis flushed"

# Re-run seed (includes migrations)
echo "[3/3] Re-running seed..."
yarn tsx scripts/playground-seed.ts
echo "  ✅ Seed complete"

echo ""
echo "✅ Playground data reset. Run 'yarn playground' to start."
