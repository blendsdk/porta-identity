#!/usr/bin/env bash
# OIDC Test Harness — Start all services
#
# Two modes:
#   Interactive (default): Starts everything, waits for Ctrl+C, then cleans up
#   CI mode (--ci):        Starts everything then exits — suitable for Playwright
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
PID_FILE="$PROJECT_ROOT/test-harness/.harness-pids"
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

# 2. Install the root dependency graph when needed
if [ ! -d "$PROJECT_ROOT/node_modules" ]; then
  echo "--- Step 2: Installing monorepo dependencies ---"
  cd "$PROJECT_ROOT"
  yarn install
  npx playwright install chromium
fi

# 3. Fail before starting services if the public test names no longer resolve locally.
echo "--- Step 3: Checking CI loopback DNS ---"
node "$PROJECT_ROOT/test-harness/scripts/check-loopback-dns.mjs"

# 4. Regenerate the ephemeral certificate for the browser-visible test hosts.
echo "--- Step 4: Generating self-signed TLS certificate ---"
mkdir -p "$PROJECT_ROOT/test-harness/certs"
openssl req -x509 -nodes -days 365 \
  -newkey rsa:2048 \
  -keyout "$PROJECT_ROOT/test-harness/certs/server.key" \
  -out "$PROJECT_ROOT/test-harness/certs/server.crt" \
  -subj "/CN=porta-harness.ci.portaidentity.com" \
  -addext "subjectAltName=DNS:porta-harness.ci.portaidentity.com,DNS:app-harness.ci.portaidentity.com,DNS:localhost,IP:127.0.0.1" 2>/dev/null
echo "  Certificate generated for the CI loopback hosts!"

# 5. Build and start Docker services
echo "--- Step 5: Docker Compose up ---"
docker compose -f "$PROJECT_ROOT/test-harness/docker-compose.yml" up -d --build

# 6. Wait for Porta health check (via nginx HTTPS)
echo "--- Step 6: Waiting for Porta health check ---"
RETRIES=60
until curl -ksf https://porta-harness.ci.portaidentity.com:3443/health > /dev/null 2>&1; do
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
echo "  Porta is healthy via the CI loopback DNS name!"

# 7. Bootstrap admin infrastructure (porta init) — required for standalone CLI auth
echo "--- Step 7: Bootstrapping admin infrastructure ---"
docker exec test-harness-porta-1 porta init --force \
  --email admin@test-harness.local \
  --given-name Admin \
  --family-name User \
  --password 'TestPassword123!'
echo "  Admin infrastructure ready!"

# 8. Run seed
echo "--- Step 8: Seeding test data ---"
cd "$PROJECT_ROOT"
npx tsx test-harness/scripts/seed.ts
echo "  Seed complete!"

# 9. Copy SPA vendor libs from node_modules
echo "--- Step 9: Copying SPA vendor libs ---"
mkdir -p "$PROJECT_ROOT/test-harness/spa/lib"
cp "$PROJECT_ROOT/node_modules/oidc-client-ts/dist/esm/oidc-client-ts.js" \
   "$PROJECT_ROOT/test-harness/spa/lib/oidc-client-ts.js"
cp "$PROJECT_ROOT/node_modules/jwt-decode/build/esm/index.js" \
   "$PROJECT_ROOT/test-harness/spa/lib/jwt-decode.js"
echo "  Libs copied!"

# 10. Start SPA HTTPS server (background) — serves SPA over HTTPS for Crypto.subtle
echo "--- Step 10: Starting SPA HTTPS server on port 4100 ---"
npx tsx "$PROJECT_ROOT/test-harness/spa-server.ts" &
SPA_PID=$!
echo "  SPA PID: $SPA_PID"

# 11. Start BFF server (background)
echo "--- Step 11: Starting BFF server on port 4101 ---"
npx tsx test-harness/bff/server.ts &
BFF_PID=$!
echo "  BFF PID: $BFF_PID"
printf '%s\n%s\n' "$SPA_PID" "$BFF_PID" > "$PID_FILE"

# 12. Wait for SPA and BFF to be ready
sleep 2

echo ""
echo "=== OIDC Test Harness: READY (cross-domain mode) ==="
echo ""
echo "  SPA:     https://app-harness.ci.portaidentity.com:4100"
echo "  BFF:     http://app-harness.ci.portaidentity.com:4101"
echo "  Porta:   https://porta-harness.ci.portaidentity.com:3443 (via nginx)"
echo "  MailHog: http://localhost:${HARNESS_MAILHOG_PORT:-8025}"

echo ""

# CI mode: exit immediately (services run in background)
if $CI_MODE; then
  echo "  CI mode — harness is ready, exiting start.sh"
  exit 0
fi

# Interactive mode: wait for Ctrl+C
echo "  Press Ctrl+C to stop all services"
echo ""

cleanup_on_signal() {
  echo "Shutting down..."
  kill "$SPA_PID" "$BFF_PID" 2>/dev/null || true
  bash "$PROJECT_ROOT/test-harness/scripts/stop.sh"
  exit 0
}

trap cleanup_on_signal INT TERM
wait
