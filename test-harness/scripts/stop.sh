#!/usr/bin/env bash
# OIDC Test Harness — Stop all services
# Kills SPA/BFF dev servers, Docker containers, and prunes stopped containers.
# See: plans/oidc-test-harness/03-docker-infrastructure.md
set -euo pipefail

echo "=== OIDC Test Harness: STOP ==="

# 1. Kill SPA and BFF dev servers (if running)
echo "Stopping SPA and BFF servers..."
pkill -f "sirv test-harness/spa" 2>/dev/null || true
pkill -f "tsx test-harness/bff/server.ts" 2>/dev/null || true

# 2. Docker Compose down with volume removal
echo "Stopping harness Docker services..."
docker compose -f test-harness/docker-compose.yml down -v 2>/dev/null || true

# 3. Stop ALL running Docker containers (nuclear approach per AR-12)
echo "Stopping all Docker containers..."
docker stop $(docker ps -q) 2>/dev/null || true

# 4. Prune stopped containers
docker container prune -f 2>/dev/null || true

echo "=== All stopped ==="
