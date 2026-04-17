#!/bin/bash

# Porta Playground Teardown Script
#
# Kills running Porta and playground server processes.
# Pass --docker flag to also stop Docker services.
#
# Usage: yarn playground:stop
#        yarn playground:stop -- --docker

echo "🛑 Stopping playground..."

# Kill BFF playground on port 4001
fuser -k 4001/tcp 2>/dev/null || true
echo "  ✅ BFF playground stopped"

# Kill SPA playground server on port 4000
fuser -k 4000/tcp 2>/dev/null || true
echo "  ✅ SPA playground stopped"

# Kill Porta server on port 3000
fuser -k 3000/tcp 2>/dev/null || true
echo "  ✅ Porta stopped"

# Optionally stop Docker services
if [ "$1" = "--docker" ]; then
  SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
  PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
  docker compose -f "$PROJECT_DIR/docker/docker-compose.yml" down
  echo "  ✅ Docker services stopped"
fi

echo "✅ All services stopped"
