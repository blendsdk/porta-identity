#!/bin/sh
# ──────────────────────────────────────────────────────────
# Porta CLI Wrapper
#
# Runs Porta CLI commands inside the porta-app Docker container.
# Place this script next to your docker-compose.yml and run:
#
#   ./porta init                    # Bootstrap admin system
#   ./porta health --direct         # Check health
#   ./porta migrate up              # Run migrations
#   ./porta login                   # Authenticate (auto manual mode)
#   ./porta org list                # List organizations
#   ./porta --help                  # See all commands
#
# The script automatically detects whether the command needs
# interactive mode (-it) based on the command arguments.
#
# For the `login` command, Docker is auto-detected inside the
# container (via /.dockerenv) so manual mode is used — no need
# to pass --no-browser explicitly.
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
