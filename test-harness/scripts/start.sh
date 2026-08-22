#!/usr/bin/env bash
# Retained compatibility entry point for the typed lifecycle supervisor.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

cd "$PROJECT_ROOT"
exec node --import tsx test-harness/scripts/lifecycle.ts start "$@"
