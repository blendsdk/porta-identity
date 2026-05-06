#!/bin/sh
# ──────────────────────────────────────────────────────────
# Porta CLI Wrapper (Docker)
#
# Runs Porta server CLI commands inside the porta-app Docker container.
# The server CLI provides infrastructure-only commands:
#
#   ./porta init                    # Bootstrap admin system
#   ./porta migrate up              # Run migrations
#   ./porta migrate status          # Check migration status
#   ./porta seed run                # Load development seed data
#   ./porta health check            # Check DB + Redis connectivity
#   ./porta user 2fa status <id>    # Check 2FA status (direct-DB)
#   ./porta --help                  # See all commands
#
# For full admin CLI (org, app, client, user, keys, config,
# audit, sessions, stats, bulk, exports, provision), install
# the standalone @portaidentity/cli package:
#
#   npm install -g @portaidentity/cli
#   porta login
#   porta org list
#
# The script automatically detects whether the command needs
# interactive mode (-it) based on the command arguments.
# ──────────────────────────────────────────────────────────

CONTAINER_NAME="porta-app"

# Check if the container is running
if ! docker inspect -f '{{.State.Running}}' "$CONTAINER_NAME" >/dev/null 2>&1; then
  echo "Error: Container '$CONTAINER_NAME' is not running." >&2
  echo "Start it first: docker compose up -d" >&2
  exit 1
fi

# Use interactive mode if stdin is a terminal (allows prompts to work)
if [ -t 0 ]; then
  exec docker exec -it "$CONTAINER_NAME" porta "$@"
else
  exec docker exec "$CONTAINER_NAME" porta "$@"
fi
