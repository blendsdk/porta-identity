#!/usr/bin/env bash
# Run retained SPA/BFF Playwright tests and always request owner-fenced cleanup.
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
status=0

bash "$SCRIPT_DIR/start.sh" --ci || status=$?

# The lifecycle command executes `playwright test` with the active endpoint manifest.
if [ "$status" -eq 0 ]; then
  if cd "$PROJECT_ROOT"; then
    node --import tsx test-harness/scripts/lifecycle.ts test || status=$?
  else
    status=30
  fi
fi

bash "$SCRIPT_DIR/stop.sh" || {
  cleanup_status=$?
  if [ "$status" -eq 0 ]; then
    status=$cleanup_status
  fi
}

exit "$status"
