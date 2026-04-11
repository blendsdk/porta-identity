# Startup Infrastructure: Playground

> **Document**: 04-startup-infra.md
> **Parent**: [Index](00-index.md)

## Overview

Provides the shell scripts and package.json modifications needed for one-command
playground startup, teardown, and reset. The goal is that `yarn playground` takes
a developer from zero to a fully running, explorable Porta instance.

## Architecture

### Startup Flow

```
yarn playground
    │
    ├── scripts/run-playground.sh
    │   ├── 1. docker compose up -d
    │   ├── 2. Wait for Postgres + Redis health
    │   ├── 3. yarn tsx scripts/playground-seed.ts
    │   ├── 4. yarn dev &  (background Porta server)
    │   ├── 5. Wait for Porta health (GET /health)
    │   ├── 6. cd playground && npx sirv-cli . --port 4000 --single
    │   └── 7. On SIGINT/SIGTERM: kill Porta, exit
    └── Done
```

### Teardown Flow

```
yarn playground:stop
    │
    ├── Kill Porta process (if running)
    ├── Kill playground server (if running)
    └── docker compose down (optional, via flag)
```

## Implementation Details

### `scripts/run-playground.sh`

```bash
#!/bin/bash
set -e

# Porta Playground Startup Script
# Orchestrates Docker, seed, Porta server, and playground static server.
# Usage: yarn playground

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
PORTA_PID=""
PLAYGROUND_PID=""

# Cleanup function — runs on exit (Ctrl+C, errors, etc.)
cleanup() {
  echo ""
  echo "🛑 Shutting down playground..."
  if [ -n "$PLAYGROUND_PID" ] && kill -0 "$PLAYGROUND_PID" 2>/dev/null; then
    kill "$PLAYGROUND_PID" 2>/dev/null || true
  fi
  if [ -n "$PORTA_PID" ] && kill -0 "$PORTA_PID" 2>/dev/null; then
    kill "$PORTA_PID" 2>/dev/null || true
  fi
  # Kill any process on port 3000 (in case tsx spawned a child)
  fuser -k 3000/tcp 2>/dev/null || true
  echo "✅ Playground stopped"
}
trap cleanup EXIT INT TERM

cd "$PROJECT_DIR"

echo "🚀 Porta Playground"
echo "   Starting all services..."
echo ""

# Step 1: Start Docker services
echo "[1/5] Starting Docker services..."
docker compose -f docker/docker-compose.yml up -d
echo "  ✅ Docker services started"

# Step 2: Wait for Postgres and Redis
echo "[2/5] Waiting for database and Redis..."
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
echo "[3/5] Running playground seed..."
yarn tsx scripts/playground-seed.ts
echo "  ✅ Seed complete"

# Step 4: Start Porta in background
echo "[4/5] Starting Porta server..."
yarn kill 2>/dev/null || true
yarn tsx src/index.ts &
PORTA_PID=$!

# Wait for Porta health
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

# Step 5: Start playground
echo "[5/5] Starting playground app..."
echo ""
echo "════════════════════════════════════════════════════════════"
echo "🎮 Playground ready!"
echo ""
echo "  Playground:  http://localhost:4000"
echo "  Porta:       http://localhost:3000"
echo "  MailHog:     http://localhost:8025"
echo ""
echo "  Press Ctrl+C to stop all services"
echo "════════════════════════════════════════════════════════════"
echo ""

cd playground
npx sirv-cli . --port 4000 --single --no-clear &
PLAYGROUND_PID=$!

# Wait for either process to exit
wait $PLAYGROUND_PID
```

### `scripts/run-playground-stop.sh`

```bash
#!/bin/bash
# Porta Playground Teardown Script
# Usage: yarn playground:stop

echo "🛑 Stopping playground..."

# Kill Porta
fuser -k 3000/tcp 2>/dev/null || true
echo "  ✅ Porta stopped"

# Kill playground
fuser -k 4000/tcp 2>/dev/null || true
echo "  ✅ Playground stopped"

# Optionally stop Docker
if [ "$1" = "--docker" ]; then
  SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
  PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
  docker compose -f "$PROJECT_DIR/docker/docker-compose.yml" down
  echo "  ✅ Docker services stopped"
fi

echo "✅ All services stopped"
```

### `scripts/run-playground-reset.sh`

```bash
#!/bin/bash
set -e

# Porta Playground Reset Script
# Drops database, re-runs migrations, re-seeds.
# Usage: yarn playground:reset

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

cd "$PROJECT_DIR"

echo "🔄 Resetting playground data..."

# Stop running services
bash scripts/run-playground-stop.sh 2>/dev/null || true

# Drop and recreate database
echo "[1/3] Resetting database..."
docker compose -f docker/docker-compose.yml exec -T postgres \
  psql -U porta -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;" porta

echo "  ✅ Database reset"

# Re-run seed (includes migrations)
echo "[2/3] Re-running seed..."
yarn tsx scripts/playground-seed.ts
echo "  ✅ Seed complete"

echo ""
echo "✅ Playground data reset. Run 'yarn playground' to start."
```

### Package.json Script Additions

```json
{
  "scripts": {
    "playground": "bash scripts/run-playground.sh",
    "playground:stop": "bash scripts/run-playground-stop.sh",
    "playground:reset": "bash scripts/run-playground-reset.sh"
  }
}
```

### Playground `package.json`

```json
{
  "name": "porta-playground",
  "version": "0.1.0",
  "private": true,
  "description": "Interactive OIDC playground for testing Porta auth flows",
  "scripts": {
    "start": "npx sirv-cli . --port 4000 --single --no-clear"
  },
  "devDependencies": {
    "sirv-cli": "^3.0.0"
  }
}
```

### `.gitignore` Additions

```
# Playground generated config (contains dynamic client IDs)
playground/config.generated.js
playground/node_modules/
```

## Integration Points

### With Docker Compose

Uses existing `docker/docker-compose.yml` unchanged. Relies on the health checks
already defined for Postgres and Redis.

### With Porta Dev Server

Uses `yarn tsx src/index.ts` (not `yarn dev` which includes `--watch`) to start
Porta without file watching. The startup script manages the process lifecycle.

### With Playground App

The startup script `cd`s into `playground/` and runs `npx sirv-cli` to serve
static files. The playground app reads `config.generated.js` produced by the seed.

## Error Handling

| Error Case | Handling Strategy |
|------------|-------------------|
| Docker not installed | Script fails at `docker compose`; error message is self-explanatory |
| Port 3000 in use | `yarn kill` runs first to free port 3000 |
| Port 4000 in use | sirv-cli will show "port in use" error |
| Seed fails | Script exits with code 1; Docker services stay running for debugging |
| Ctrl+C during startup | Cleanup trap kills all spawned processes |
