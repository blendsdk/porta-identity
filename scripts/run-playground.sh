#!/bin/bash
set -e

# Porta Playground Startup Script
#
# Orchestrates Docker services, seed data, Porta server, and playground
# static server for one-command development environment startup.
#
# Usage: yarn playground
# Stop:  Ctrl+C (cleanup trap handles all processes)

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
PORTA_PID=""
PLAYGROUND_PID=""
BFF_PID=""

# Cleanup function — runs on exit (Ctrl+C, errors, etc.)
cleanup() {
  echo ""
  echo "🛑 Shutting down playground..."
  if [ -n "$BFF_PID" ] && kill -0 "$BFF_PID" 2>/dev/null; then
    kill "$BFF_PID" 2>/dev/null || true
  fi
  if [ -n "$PLAYGROUND_PID" ] && kill -0 "$PLAYGROUND_PID" 2>/dev/null; then
    kill "$PLAYGROUND_PID" 2>/dev/null || true
  fi
  if [ -n "$PORTA_PID" ] && kill -0 "$PORTA_PID" 2>/dev/null; then
    kill "$PORTA_PID" 2>/dev/null || true
  fi
  # Kill any process on ports 3000/4000/4001 (in case tsx spawned children)
  fuser -k 3000/tcp 2>/dev/null || true
  fuser -k 4000/tcp 2>/dev/null || true
  fuser -k 4001/tcp 2>/dev/null || true
  echo "✅ Playground stopped"
}
trap cleanup EXIT INT TERM

cd "$PROJECT_DIR"

echo "🚀 Porta Playground"
echo "   Starting all services..."
echo ""

# Step 1: Start Docker services
echo "[1/6] Starting Docker services..."
docker compose -f docker/docker-compose.yml up -d
echo "  ✅ Docker services started"

# Step 2: Wait for Postgres and Redis to become healthy
echo "[2/6] Waiting for database and Redis..."
MAX_RETRIES=30
RETRY=0
until docker compose -f docker/docker-compose.yml exec -T postgres pg_isready -U porta > /dev/null 2>&1; do
  RETRY=$((RETRY + 1))
  if [ $RETRY -ge $MAX_RETRIES ]; then
    echo "  ❌ Postgres did not become ready in time"
    exit 1
  fi
  sleep 1
done
echo "  ✅ Postgres ready"

RETRY=0
until docker compose -f docker/docker-compose.yml exec -T redis redis-cli ping > /dev/null 2>&1; do
  RETRY=$((RETRY + 1))
  if [ $RETRY -ge $MAX_RETRIES ]; then
    echo "  ❌ Redis did not become ready in time"
    exit 1
  fi
  sleep 1
done
echo "  ✅ Redis ready"

# Step 3: Run seed (includes migrations)
echo "[3/6] Running playground seed..."
yarn tsx scripts/playground-seed.ts
echo "  ✅ Seed complete"

# Step 4: Start Porta in background
echo "[4/6] Starting Porta server..."
yarn kill 2>/dev/null || true
yarn tsx src/index.ts &
PORTA_PID=$!

# Wait for Porta health endpoint
MAX_RETRIES=30
RETRY=0
until curl -sf http://localhost:3000/health > /dev/null 2>&1; do
  RETRY=$((RETRY + 1))
  if [ $RETRY -ge $MAX_RETRIES ]; then
    echo "  ❌ Porta did not become healthy in time"
    exit 1
  fi
  sleep 1
done
echo "  ✅ Porta server running on http://localhost:3000"

# Step 5: Install playground dependencies and start static server
echo "[5/6] Starting SPA playground..."

# Install sirv-cli if not present
if [ ! -d playground/node_modules ]; then
  cd playground && yarn install --frozen-lockfile 2>/dev/null || yarn install && cd ..
fi

cd playground
npx sirv-cli . --port 4000 --single --no-clear --dev &
PLAYGROUND_PID=$!
cd "$PROJECT_DIR"

# Step 6: Install BFF dependencies and start BFF server
echo "[6/6] Starting BFF playground..."

if [ -d playground-bff ]; then
  if [ ! -d playground-bff/node_modules ]; then
    cd playground-bff && yarn install --frozen-lockfile 2>/dev/null || yarn install && cd "$PROJECT_DIR"
  fi

  cd playground-bff
  npx tsx src/server.ts &
  BFF_PID=$!
  cd "$PROJECT_DIR"

  # Wait for BFF health endpoint
  BFF_RETRIES=0
  until curl -sf http://localhost:4001/health > /dev/null 2>&1; do
    BFF_RETRIES=$((BFF_RETRIES + 1))
    if [ $BFF_RETRIES -ge 30 ]; then
      echo "  ⚠️  BFF playground did not become healthy (continuing without it)"
      break
    fi
    sleep 1
  done
  if [ $BFF_RETRIES -lt 30 ]; then
    echo "  ✅ BFF playground running on http://localhost:4001"
  fi
else
  echo "  ⚠️  playground-bff/ not found, skipping BFF server"
fi

echo ""
echo "════════════════════════════════════════════════════════════"
echo "🎮 Playground ready!"
echo ""
echo "  SPA:         http://localhost:4000"
echo "  BFF:         http://localhost:4001"
echo "  Porta:       http://localhost:3000"
echo "  MailHog:     http://localhost:8025"
echo ""
echo "  Press Ctrl+C to stop all services"
echo "════════════════════════════════════════════════════════════"
echo ""

# Wait for either process to exit
wait $PLAYGROUND_PID
