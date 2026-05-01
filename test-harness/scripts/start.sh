#!/usr/bin/env bash
# OIDC Test Harness — Start all services
#
# Two modes:
#   Interactive (default): Starts everything, waits for Ctrl+C, then cleans up
#   CI mode (--ci):        Starts everything then exits — suitable for Playwright
#
# See: plans/oidc-test-harness/03-docker-infrastructure.md
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
CI_MODE=false

# Parse --ci flag
if [[ "${1:-}" == "--ci" ]]; then
  CI_MODE=true
fi

echo "=== OIDC Test Harness: START ==="
if $CI_MODE; then echo "  (CI mode — will exit after setup)"; fi

# 1. Always reset first
echo "--- Step 1: Clean stop ---"
bash "$PROJECT_ROOT/test-harness/scripts/stop.sh"

# 2. Install dependencies (if node_modules missing)
if [ ! -d "$PROJECT_ROOT/test-harness/node_modules" ]; then
  echo "--- Step 2: Installing test-harness dependencies ---"
  cd "$PROJECT_ROOT/test-harness"
  yarn install
  npx playwright install chromium
  cd "$PROJECT_ROOT"
fi

# 3. Generate TLS certificate (if not already present)
if [ ! -f "$PROJECT_ROOT/test-harness/certs/server.crt" ]; then
  echo "--- Step 3: Generating self-signed TLS certificate ---"
  mkdir -p "$PROJECT_ROOT/test-harness/certs"
  openssl req -x509 -nodes -days 365 \
    -newkey rsa:2048 \
    -keyout "$PROJECT_ROOT/test-harness/certs/server.key" \
    -out "$PROJECT_ROOT/test-harness/certs/server.crt" \
    -subj "/CN=porta.local" \
    -addext "subjectAltName=DNS:porta.local,DNS:app.local,DNS:localhost,IP:127.0.0.1" 2>/dev/null
  echo "  Certificate generated (SANs: porta.local, app.local, localhost, 127.0.0.1)!"
fi

# 4. Build and start Docker services
echo "--- Step 4: Docker Compose up ---"
docker compose -f "$PROJECT_ROOT/test-harness/docker-compose.yml" up -d --build

# 5. Wait for Porta health check (via nginx HTTPS)
echo "--- Step 5: Waiting for Porta health check ---"
RETRIES=60
until curl -ksf https://porta.local:3443/health > /dev/null 2>&1; do
  RETRIES=$((RETRIES - 1))
  if [ $RETRIES -le 0 ]; then
    echo "ERROR: Porta failed to become healthy within 60 seconds"
    echo "Docker logs:"
    docker compose -f "$PROJECT_ROOT/test-harness/docker-compose.yml" logs porta
    exit 1
  fi
  echo "  Waiting for Porta... ($RETRIES retries left)"
  sleep 1
done
echo "  Porta is healthy (via nginx TLS proxy at porta.local:3443)!"

# 6. Run seed
echo "--- Step 6: Seeding test data ---"
cd "$PROJECT_ROOT"
npx tsx test-harness/scripts/seed.ts
echo "  Seed complete!"

# 7. Copy SPA vendor libs from node_modules
echo "--- Step 7: Copying SPA vendor libs ---"
mkdir -p "$PROJECT_ROOT/test-harness/spa/lib"
cp "$PROJECT_ROOT/test-harness/node_modules/oidc-client-ts/dist/esm/oidc-client-ts.js" \
   "$PROJECT_ROOT/test-harness/spa/lib/oidc-client-ts.js"
cp "$PROJECT_ROOT/test-harness/node_modules/jwt-decode/build/esm/index.js" \
   "$PROJECT_ROOT/test-harness/spa/lib/jwt-decode.js"
echo "  Libs copied!"

# 8. Start SPA HTTPS server (background) — serves SPA over HTTPS for Crypto.subtle
echo "--- Step 8: Starting SPA HTTPS server on port 4100 ---"
npx tsx "$PROJECT_ROOT/test-harness/spa-server.ts" &
SPA_PID=$!
echo "  SPA PID: $SPA_PID"

# 9. Start BFF server (background)
echo "--- Step 9: Starting BFF server on port 4101 ---"
npx tsx test-harness/bff/server.ts &
BFF_PID=$!
echo "  BFF PID: $BFF_PID"

# 10. Wait for SPA and BFF to be ready
sleep 2

echo ""
echo "=== OIDC Test Harness: READY (cross-domain mode) ==="
echo ""
echo "  SPA:     https://app.local:4100"
echo "  BFF:     http://app.local:4101"
echo "  Porta:   https://porta.local:3443 (via nginx)"
echo "  MailHog: http://localhost:8025"
echo ""

# CI mode: exit immediately (services run in background)
if $CI_MODE; then
  echo "  CI mode — harness is ready, exiting start.sh"
  exit 0
fi

# Interactive mode: wait for Ctrl+C
echo "  Press Ctrl+C to stop all services"
echo ""
trap "echo 'Shutting down...'; kill $SPA_PID $BFF_PID 2>/dev/null; bash $PROJECT_ROOT/test-harness/scripts/stop.sh; exit 0" INT TERM
wait
