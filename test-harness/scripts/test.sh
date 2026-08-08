#!/usr/bin/env bash
# Run the OIDC harness and preserve the first failure while always cleaning up.
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
status=0

bash "$SCRIPT_DIR/start.sh" --ci || status=$?

if [ "$status" -eq 0 ]; then
  cd "$PROJECT_ROOT/test-harness"
  npx playwright test || status=$?
fi

cd "$PROJECT_ROOT"
bash "$SCRIPT_DIR/stop.sh" || {
  cleanup_status=$?
  if [ "$status" -eq 0 ]; then
    status=$cleanup_status
  fi
}

exit "$status"
