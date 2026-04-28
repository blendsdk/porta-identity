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
#   ./porta provision -f setup.yml  # Provision from a local file
#   ./porta --help                  # See all commands
#
# The script automatically detects whether the command needs
# interactive mode (-it) based on the command arguments.
#
# When -f/--file references a file on the host, the script
# automatically pipes it to the container via stdin so that
# `./porta provision -f setup.yml` works transparently.
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

# ── Host file detection for -f/--file ───────────────────
# Scan arguments for -f/--file pointing to a host file.
# If found, pipe the file via stdin and replace the path
# with /dev/stdin so the container can read it.
HOST_FILE=""
REWRITTEN=""
EXPECT_FILE=false

for arg in "$@"; do
  if $EXPECT_FILE; then
    EXPECT_FILE=false
    if [ -f "$arg" ]; then
      HOST_FILE="$arg"
      REWRITTEN="$REWRITTEN /dev/stdin"
    else
      REWRITTEN="$REWRITTEN $arg"
    fi
    continue
  fi
  case "$arg" in
    -f|--file)
      EXPECT_FILE=true
      REWRITTEN="$REWRITTEN $arg"
      ;;
    *)
      REWRITTEN="$REWRITTEN $arg"
      ;;
  esac
done

if [ -n "$HOST_FILE" ]; then
  # Pipe the host file to the container via stdin.
  # Use -i (not -it) since stdin is redirected from a file.
  # shellcheck disable=SC2086
  exec docker exec -i "$CONTAINER_NAME" porta $REWRITTEN < "$HOST_FILE"
fi

# ── Default execution (no host file) ────────────────────
# Use interactive mode if stdin is a terminal (allows prompts to work)
if [ -t 0 ]; then
  exec docker exec -it "$CONTAINER_NAME" porta "$@"
else
  exec docker exec "$CONTAINER_NAME" porta "$@"
fi
