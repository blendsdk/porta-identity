#!/usr/bin/env bash
# OIDC Test Harness — Stop all services
# Stops only the SPA, BFF, and Docker services owned by this test harness.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
PID_FILE="$PROJECT_ROOT/test-harness/.harness-pids"

echo "=== OIDC Test Harness: STOP ==="

# 1. Stop only the SPA and BFF processes recorded by the harness starter.
echo "Stopping SPA and BFF servers..."
if [ -f "$PID_FILE" ]; then
  while IFS= read -r pid; do
    case "$pid" in
      ''|*[!0-9]*) continue ;;
    esac

    command_line="$(ps -p "$pid" -o args= 2>/dev/null || true)"
    case "$command_line" in
      *test-harness/spa-server.ts*|*test-harness/bff/server.ts*) kill "$pid" 2>/dev/null || true ;;
    esac
  done < "$PID_FILE"
  rm -f "$PID_FILE"
fi

# 2. Docker Compose down with volume removal
echo "Stopping harness Docker services..."
docker compose -f "$PROJECT_ROOT/test-harness/docker-compose.yml" down -v 2>/dev/null || true

echo "=== All stopped ==="
