#!/usr/bin/env bash
#
# install-porta.sh — guided installation of a standalone Porta deployment.
#
# This script writes a self-contained Docker Compose stack (Porta + PostgreSQL +
# Redis, plus an optional MailHog dev profile) and a matching .env file with
# freshly generated secrets. It can then start the stack, apply migrations as a
# controlled deployment step, and optionally bootstrap the admin system.
#
# It is safe to run non-interactively from CI or a configuration tool. Every
# question it would ask is also available as a command-line flag, so the whole
# installation can be reproduced with a single command.
#
# Typical interactive use on a remote server:
#
#   curl -fsSL https://raw.githubusercontent.com/blendsdk/porta-identity/main/install-porta.sh | bash
#
# Passing flags through the pipe (note the `bash -s --`):
#
#   curl -fsSL .../install-porta.sh | bash -s -- --issuer-url https://auth.example.com
#
# Download-then-run is also fine and avoids the stdin question entirely:
#
#   curl -fsSL .../install-porta.sh -o install-porta.sh
#   bash install-porta.sh
#
set -Eeuo pipefail

# ─────────────────────────────────────────────────────────────────────────────
# Constants
# ─────────────────────────────────────────────────────────────────────────────

SCRIPT_NAME="${0##*/}"
PORTA_IMAGE_DEFAULT="blendsdk/porta:latest"
DEFAULT_DIR="./porta"
DEFAULT_PORT_START=3000
PORT_SCAN_RANGE=200
HEALTH_TIMEOUT_SECONDS=120

# Terminal escape sequences are only emitted when the output is a terminal.
if [ -t 1 ] || [ -t 2 ]; then
  COLOR_RED=$'\033[31m'
  COLOR_GREEN=$'\033[32m'
  COLOR_YELLOW=$'\033[33m'
  COLOR_BLUE=$'\033[34m'
  COLOR_RESET=$'\033[0m'
else
  COLOR_RED=""
  COLOR_GREEN=""
  COLOR_YELLOW=""
  COLOR_BLUE=""
  COLOR_RESET=""
fi

# ─────────────────────────────────────────────────────────────────────────────
# Output helpers
# ─────────────────────────────────────────────────────────────────────────────

log() { printf '%s==>%s %s\n' "$COLOR_BLUE" "$COLOR_RESET" "$*"; }
ok() { printf '%s✓%s %s\n' "$COLOR_GREEN" "$COLOR_RESET" "$*"; }
warn() { printf '%s!%s %s\n' "$COLOR_YELLOW" "$COLOR_RESET" "$*" >&2; }

# Prints an error and exits with status 1. Used for unrecoverable problems.
die() {
  printf '%serror:%s %s\n' "$COLOR_RED" "$COLOR_RESET" "$*" >&2
  exit 1
}

# Emits a final, actionable diagnostic when any command fails unexpectedly.
on_error() {
  local exit_code=$?
  trap - ERR
  local line_number=${1:-?}
  printf '\n%serror:%s installation failed at line %s (exit %s).\n' \
    "$COLOR_RED" "$COLOR_RESET" "$line_number" "$exit_code" >&2
  printf 'Run with bash -x for a trace, or inspect the generated files in "%s".\n' \
    "${TARGET_DIR:-$DEFAULT_DIR}" >&2
  exit "$exit_code"
}
trap 'on_error $LINENO' ERR

# ─────────────────────────────────────────────────────────────────────────────
# Usage
# ─────────────────────────────────────────────────────────────────────────────

usage() {
  cat <<EOF
${SCRIPT_NAME} — install a standalone Porta Docker Compose deployment

Usage:
  curl -fsSL <raw-url>/install-porta.sh | bash
  curl -fsSL <raw-url>/install-porta.sh | bash -s -- [options]
  bash install-porta.sh [options]

When no terminal is attached (for example, piped into bash), supply the
required values as flags or the script exits with an example command.

Options:
  -d, --dir DIR             Target directory for docker-compose.yml and .env
                            (default: ${DEFAULT_DIR})
  -p, --port PORT           Host port to publish Porta on. When omitted, the
                            script scans Docker and host listeners and suggests
                            the first free port from ${DEFAULT_PORT_START}.
      --bind ADDR           Host interface to bind the published port to
                            (default: 0.0.0.0; use 127.0.0.1 for a proxy on
                            the same host)
  -u, --issuer-url URL      Public URL clients will use. Required for an
                            unattended install. HTTPS is required outside
                            localhost unless --allow-http is given.
      --no-proxy            Porta is exposed directly (TRUST_PROXY=false)
      --trust-proxy-hops N  Trusted proxy hops (default: 1)
      --smtp-host HOST      SMTP relay hostname
      --smtp-port PORT      SMTP relay port (default: 587)
      --smtp-user USER      SMTP username
      --smtp-pass PASS      SMTP password
      --smtp-from ADDRESS   Sender address (default: noreply@<issuer host>)
      --skip-smtp           Use the bundled MailHog inbox instead of a real
                            relay. Email is captured, not delivered. Evaluation
                            only.
      --postgres-password P Database password (generated when omitted)
      --image REF           Porta image reference
                            (default: ${PORTA_IMAGE_DEFAULT})
      --admin-email EMAIL   Bootstrap the first admin non-interactively. Must
                            be combined with --admin-password.
      --admin-given-name N  Admin given name (default: Admin)
      --admin-family-name N Admin family name (default: User)
      --admin-password P    Admin password (only with --admin-email)
      --no-start            Only write docker-compose.yml and .env
      --force               Overwrite existing files in the target directory
      --fresh               Ignore answers saved in an existing .env and ask
                            again (combine with --force when files exist)
      --allow-http          Evaluation mode: allow an HTTP issuer on a
                            non-localhost host, disable production mode and
                            proxy trust. Never use in production.
      --non-interactive     Never prompt; fail when a required value is missing
  -h, --help                Show this help and exit
EOF
}

# ─────────────────────────────────────────────────────────────────────────────
# Terminal handling
#
# `curl ... | bash` feeds the script body to bash through stdin, so stdin is a
# pipe rather than a terminal. Reading a prompt from stdin would consume script
# bytes and corrupt execution. We therefore open the controlling terminal
# (/dev/tty) on a dedicated descriptor and read every prompt from there.
# ─────────────────────────────────────────────────────────────────────────────

TTY_IN=""
TTY_OUT=""
TTY_DEV=""

setup_terminal() {
  if [ "$NON_INTERACTIVE" = "1" ]; then
    return 0
  fi

  if [ -e /dev/tty ] && { exec 3<>/dev/tty; } 2>/dev/null; then
    TTY_IN=3
    TTY_OUT=3
    TTY_DEV=/dev/tty
  elif [ -t 0 ]; then
    TTY_IN=0
    TTY_OUT=2
    TTY_DEV=/dev/tty
  fi
}

# Reads one line from the terminal. When no terminal is available, returns the
# provided default (which may be empty) and reports whether it could prompt.
read_answer() {
  local prompt="$1" default="${2:-}" secret="${3:-0}" answer=""
  if [ -z "$TTY_IN" ]; then
    printf '%s' "$default"
    return 0
  fi

  if [ "$secret" = "1" ]; then
    # Never echo a secret default back to the terminal; just say one is kept.
    if [ -n "$default" ]; then
      printf '%s [press Enter to keep current]: ' "$prompt" >&"$TTY_OUT"
    else
      printf '%s: ' "$prompt" >&"$TTY_OUT"
    fi
    IFS= read -rs answer <&"$TTY_IN" || true
    printf '\n' >&"$TTY_OUT"
  else
    if [ -n "$default" ]; then
      printf '%s [%s]: ' "$prompt" "$default" >&"$TTY_OUT"
    else
      printf '%s: ' "$prompt" >&"$TTY_OUT"
    fi
    IFS= read -r answer <&"$TTY_IN" || true
  fi

  printf '%s' "${answer:-$default}"
}

# Prompts for a value only when the caller did not already supply one.
prompt_value() {
  local variable_name="$1" prompt="$2" default="${3:-}" secret="${4:-0}"
  local current="${!variable_name:-}"

  if [ -n "$current" ]; then
    return 0
  fi

  if [ -z "$TTY_IN" ]; then
    if [ -n "$default" ]; then
      printf -v "$variable_name" '%s' "$default"
      return 0
    fi
    die "Missing required value '${prompt}'. Supply it as a flag (see --help) or run interactively."
  fi

  local answer
  answer="$(read_answer "$prompt" "$default" "$secret")"
  if [ -z "$answer" ] && [ -z "$default" ]; then
    die "A value is required for '${prompt}'."
  fi
  printf -v "$variable_name" '%s' "$answer"
}

# Asks a yes/no question. Non-interactive runs return the default answer.
confirm() {
  local prompt="$1" default="${2:-y}" answer=""
  if [ -z "$TTY_IN" ]; then
    [ "$default" = "y" ]
    return $?
  fi

  local hint="y/N"
  [ "$default" = "y" ] && hint="Y/n"
  printf '%s [%s]: ' "$prompt" "$hint" >&"$TTY_OUT"
  IFS= read -r answer <&"$TTY_IN" || answer=""
  answer="${answer:-$default}"
  case "$answer" in
    [Yy]*) return 0 ;;
    *) return 1 ;;
  esac
}

# ─────────────────────────────────────────────────────────────────────────────
# Secret generation
# ─────────────────────────────────────────────────────────────────────────────

# Generates a URL-safe base64 secret, avoiding characters that need quoting in
# .env or the PostgreSQL connection URL.
random_token() {
  local bytes="${1:-32}"
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -base64 "$bytes" | tr '+/' '-_' | tr -d '='
  elif command -v node >/dev/null 2>&1; then
    node -e "process.stdout.write(require('crypto').randomBytes($bytes).toString('base64url'))"
  else
    head -c "$bytes" /dev/urandom | base64 | tr '+/' '-_' | tr -d '='
  fi
}

# Generates an exactly 64-character lowercase hexadecimal key.
random_hex64() {
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -hex 32
  elif command -v node >/dev/null 2>&1; then
    node -e "process.stdout.write(require('crypto').randomBytes(32).toString('hex'))"
  else
    head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n'
  fi
}

# ─────────────────────────────────────────────────────────────────────────────
# Port discovery
# ─────────────────────────────────────────────────────────────────────────────

# Collects host ports published by running Docker containers.
collect_docker_ports() {
  command -v docker >/dev/null 2>&1 || return 0
  docker ps --format '{{.Ports}}' 2>/dev/null \
    | grep -oE ':[0-9]+->' | tr -d ':->' || true
}

# Collects local listening TCP ports without requiring root privileges.
collect_host_ports() {
  if command -v ss >/dev/null 2>&1; then
    ss -ltn 2>/dev/null | awk 'NR > 1 { print $4 }' \
      | sed -E 's/.*:([0-9]+)$/\1/' | grep -E '^[0-9]+$' || true
  elif command -v netstat >/dev/null 2>&1; then
    netstat -ltn 2>/dev/null | awk 'NR > 2 { print $4 }' \
      | sed -E 's/.*:([0-9]+)$/\1/' | grep -E '^[0-9]+$' || true
  fi
}

# Returns success when a TCP connection to the port succeeds, meaning it is busy.
port_is_busy() {
  local port="$1"
  ( exec 3<>"/dev/tcp/127.0.0.1/${port}" ) 2>/dev/null && { exec 3>&- 2>/dev/null || true; return 0; }
  return 1
}

# Suggests the first free port, preferring ports that are not already used by
# another container or host process.
suggest_port() {
  local used_ports="$1" candidate
  for (( candidate=DEFAULT_PORT_START; candidate<DEFAULT_PORT_START+PORT_SCAN_RANGE; candidate++ )); do
    if printf '%s\n' "$used_ports" | grep -qx "$candidate"; then
      continue
    fi
    if port_is_busy "$candidate"; then
      continue
    fi
    printf '%s' "$candidate"
    return 0
  done
  return 1
}

# ─────────────────────────────────────────────────────────────────────────────
# Prerequisite checks
# ─────────────────────────────────────────────────────────────────────────────

require_docker() {
  command -v docker >/dev/null 2>&1 || die "Docker is not installed or not on PATH."
  docker info >/dev/null 2>&1 \
    || die "Cannot talk to the Docker daemon. Start Docker or run with sufficient privileges."
  docker compose version >/dev/null 2>&1 \
    || die "Docker Compose v2 is required (the 'docker compose' subcommand was not found)."
}

require_host_curl() {
  command -v curl >/dev/null 2>&1 || command -v wget >/dev/null 2>&1 \
    || die "curl or wget is required to check the health endpoint."
}

# ─────────────────────────────────────────────────────────────────────────────
# Validation
# ─────────────────────────────────────────────────────────────────────────────

validate_port() {
  local port="$1"
  [[ "$port" =~ ^[0-9]+$ ]] || die "Port must be a number, got: ${port}"
  if (( port < 1 || port > 65535 )); then
    die "Port must be between 1 and 65535, got: ${port}"
  fi
}

# Extracts the hostname from an issuer URL without requiring external tools.
issuer_host() {
  local url="$1"
  url="${url#*://}"
  url="${url%%/*}"
  url="${url%%:*}"
  printf '%s' "$url"
}

validate_issuer_url() {
  local url="$1"
  [[ "$url" =~ ^https?://[^/[:space:]]+ ]] || die "ISSUER_BASE_URL must be a valid http(s) URL, got: ${url}"
  local host
  host="$(issuer_host "$url")"
  if [[ "$url" =~ ^http:// ]] && [ "$host" != "localhost" ] && [ "$host" != "127.0.0.1" ]; then
    if [ "$ALLOW_HTTP" != "1" ]; then
      die "ISSUER_BASE_URL must use HTTPS for a non-localhost host. Put Porta behind a TLS-terminating proxy, or pass --allow-http for an evaluation-only install."
    fi
  fi
}

# ─────────────────────────────────────────────────────────────────────────────
# Argument parsing
# ─────────────────────────────────────────────────────────────────────────────

TARGET_DIR=""
HOST_PORT=""
BIND_ADDR=""
ISSUER_BASE_URL=""
TRUST_PROXY=""
TRUST_PROXY_HOPS=""
TRUST_PROXY_SET="0"
SMTP_HOST=""
SMTP_PORT=""
SMTP_USER=""
SMTP_PASS=""
SMTP_FROM=""
SKIP_SMTP="0"
POSTGRES_PASSWORD=""
PORTA_IMAGE=""
ADMIN_EMAIL=""
ADMIN_GIVEN_NAME=""
ADMIN_FAMILY_NAME=""
ADMIN_PASSWORD=""
DO_START="1"
FORCE="0"
FRESH="0"
ALLOW_HTTP="0"
NON_INTERACTIVE="0"
REUSED_CONFIG="0"
existing_cookie=""
existing_tfe=""
existing_signing=""

parse_args() {
  while [ $# -gt 0 ]; do
    case "$1" in
      -d|--dir) TARGET_DIR="${2:?--dir needs a value}"; shift 2 ;;
      --dir=*) TARGET_DIR="${1#*=}"; shift ;;
      -p|--port) HOST_PORT="${2:?--port needs a value}"; shift 2 ;;
      --port=*) HOST_PORT="${1#*=}"; shift ;;
      --bind) BIND_ADDR="${2:?--bind needs a value}"; shift 2 ;;
      --bind=*) BIND_ADDR="${1#*=}"; shift ;;
      -u|--issuer-url) ISSUER_BASE_URL="${2:?--issuer-url needs a value}"; shift 2 ;;
      --issuer-url=*) ISSUER_BASE_URL="${1#*=}"; shift ;;
      --no-proxy) TRUST_PROXY="false"; TRUST_PROXY_SET="1"; shift ;;
      --trust-proxy-hops) TRUST_PROXY_HOPS="${2:?--trust-proxy-hops needs a value}"; shift 2 ;;
      --trust-proxy-hops=*) TRUST_PROXY_HOPS="${1#*=}"; shift ;;
      --smtp-host) SMTP_HOST="${2:?--smtp-host needs a value}"; shift 2 ;;
      --smtp-host=*) SMTP_HOST="${1#*=}"; shift ;;
      --smtp-port) SMTP_PORT="${2:?--smtp-port needs a value}"; shift 2 ;;
      --smtp-port=*) SMTP_PORT="${1#*=}"; shift ;;
      --smtp-user) SMTP_USER="${2:?--smtp-user needs a value}"; shift 2 ;;
      --smtp-user=*) SMTP_USER="${1#*=}"; shift ;;
      --smtp-pass) SMTP_PASS="${2:?--smtp-pass needs a value}"; shift 2 ;;
      --smtp-pass=*) SMTP_PASS="${1#*=}"; shift ;;
      --smtp-from) SMTP_FROM="${2:?--smtp-from needs a value}"; shift 2 ;;
      --smtp-from=*) SMTP_FROM="${1#*=}"; shift ;;
      --skip-smtp) SKIP_SMTP="1"; shift ;;
      --postgres-password) POSTGRES_PASSWORD="${2:?--postgres-password needs a value}"; shift 2 ;;
      --postgres-password=*) POSTGRES_PASSWORD="${1#*=}"; shift ;;
      --image) PORTA_IMAGE="${2:?--image needs a value}"; shift 2 ;;
      --image=*) PORTA_IMAGE="${1#*=}"; shift ;;
      --admin-email) ADMIN_EMAIL="${2:?--admin-email needs a value}"; shift 2 ;;
      --admin-email=*) ADMIN_EMAIL="${1#*=}"; shift ;;
      --admin-given-name) ADMIN_GIVEN_NAME="${2:?--admin-given-name needs a value}"; shift 2 ;;
      --admin-given-name=*) ADMIN_GIVEN_NAME="${1#*=}"; shift ;;
      --admin-family-name) ADMIN_FAMILY_NAME="${2:?--admin-family-name needs a value}"; shift 2 ;;
      --admin-family-name=*) ADMIN_FAMILY_NAME="${1#*=}"; shift ;;
      --admin-password) ADMIN_PASSWORD="${2:?--admin-password needs a value}"; shift 2 ;;
      --admin-password=*) ADMIN_PASSWORD="${1#*=}"; shift ;;
      --no-start) DO_START="0"; shift ;;
      --force) FORCE="1"; shift ;;
      --fresh) FRESH="1"; shift ;;
      --allow-http) ALLOW_HTTP="1"; shift ;;
      --non-interactive) NON_INTERACTIVE="1"; shift ;;
      -h|--help) usage; exit 0 ;;
      *) die "Unknown option: $1 (see --help)" ;;
    esac
  done
}

# ─────────────────────────────────────────────────────────────────────────────
# Environment file rendering
# ─────────────────────────────────────────────────────────────────────────────

# Escapes a value for a double-quoted .env assignment so that quotes,
# backslashes and newlines cannot break the file format.
quote_env_value() {
  local value="$1"
  value="${value//\\/\\\\}"
  value="${value//\"/\\\"}"
  value="${value//$'\n'/}"
  value="${value//$'\r'/}"
  printf '%s' "$value"
}

# Reads one value from an existing .env file, stripping surrounding quotes.
# Returns non-zero when the key is absent. Used to reuse secrets on --force so
# that a reinstall keeps the password already baked into the PostgreSQL volume.
read_env_value() {
  local file="$1" key="$2" line value
  [ -f "$file" ] || return 1
  line="$(grep -E "^${key}=" "$file" | tail -n 1 || true)"
  [ -n "$line" ] || return 1
  value="${line#*=}"
  case "$value" in
    \"*\") value="${value#\"}"; value="${value%\"}" ;;
  esac
  [ -n "$value" ] || return 1
  printf '%s' "$value"
}

# Reuses answers saved in an existing .env so repeated test runs do not require
# retyping. Command-line flags always win: this only fills variables that are
# still empty. `--fresh` skips reuse entirely; `--force` is still required to
# overwrite the files.
load_existing_configuration() {
  [ -f "$ENV_FILE" ] || return 0
  [ "$FRESH" = "1" ] && return 0

  local value

  value="$(read_env_value "$ENV_FILE" ISSUER_BASE_URL || true)"
  [ -n "$ISSUER_BASE_URL" ] || ISSUER_BASE_URL="$value"
  value="$(read_env_value "$ENV_FILE" HOST_PORT || true)"
  [ -n "$HOST_PORT" ] || HOST_PORT="$value"
  value="$(read_env_value "$ENV_FILE" BIND_ADDR || true)"
  [ -n "$BIND_ADDR" ] || BIND_ADDR="$value"
  value="$(read_env_value "$ENV_FILE" PORTA_IMAGE || true)"
  [ -n "$PORTA_IMAGE" ] || PORTA_IMAGE="$value"
  value="$(read_env_value "$ENV_FILE" POSTGRES_PASSWORD || true)"
  [ -n "$POSTGRES_PASSWORD" ] || POSTGRES_PASSWORD="$value"
  value="$(read_env_value "$ENV_FILE" SMTP_HOST || true)"
  [ -n "$SMTP_HOST" ] || SMTP_HOST="$value"
  value="$(read_env_value "$ENV_FILE" SMTP_PORT || true)"
  [ -n "$SMTP_PORT" ] || SMTP_PORT="$value"
  value="$(read_env_value "$ENV_FILE" SMTP_USER || true)"
  [ -n "$SMTP_USER" ] || SMTP_USER="$value"
  value="$(read_env_value "$ENV_FILE" SMTP_PASS || true)"
  [ -n "$SMTP_PASS" ] || SMTP_PASS="$value"
  value="$(read_env_value "$ENV_FILE" SMTP_FROM || true)"
  [ -n "$SMTP_FROM" ] || SMTP_FROM="$value"

  if [ "$TRUST_PROXY_SET" != "1" ]; then
    value="$(read_env_value "$ENV_FILE" TRUST_PROXY || true)"
    if [ -n "$value" ]; then
      TRUST_PROXY="$value"
    fi
  fi
  value="$(read_env_value "$ENV_FILE" TRUST_PROXY_HOPS || true)"
  [ -n "$TRUST_PROXY_HOPS" ] || TRUST_PROXY_HOPS="$value"

  if [ "$ALLOW_HTTP" != "1" ]; then
    value="$(read_env_value "$ENV_FILE" NODE_ENV || true)"
    if [ "$value" = "development" ]; then
      ALLOW_HTTP="1"
    fi
  fi

  if [ -z "$SMTP_HOST" ] || [ "$SMTP_HOST" = "mailhog" ]; then
    SKIP_SMTP="1"
  fi

  existing_cookie="$(read_env_value "$ENV_FILE" COOKIE_KEYS || true)"
  existing_tfe="$(read_env_value "$ENV_FILE" TWO_FACTOR_ENCRYPTION_KEY || true)"
  existing_signing="$(read_env_value "$ENV_FILE" SIGNING_KEY_ENCRYPTION_KEY || true)"

  REUSED_CONFIG="1"
  log "Reusing saved configuration from ${ENV_FILE} (flags override; --fresh to ignore)."
}

# Writes a fixed .env containing generated secrets and the resolved settings.
# The file is created with owner-only permissions because it holds root secrets.
write_env_file() {
  local cookie_key="$1" tfe_key="$2" signing_key="$3"

  {
    printf '# Porta deployment configuration — generated by install-porta.sh\n'
    printf '# Keep this file private: it contains root encryption secrets.\n\n'
    printf 'NODE_ENV=%s\n' "$NODE_ENV_VALUE"
    printf 'PORT=3000\n'
    printf 'HOST=0.0.0.0\n\n'
    printf 'BIND_ADDR=%s\n' "$BIND_ADDR"
    printf 'HOST_PORT=%s\n' "$HOST_PORT"
    printf 'PORTA_IMAGE=%s\n\n' "$PORTA_IMAGE"
    printf 'POSTGRES_PASSWORD="%s"\n\n' "$(quote_env_value "$POSTGRES_PASSWORD")"
    printf 'ISSUER_BASE_URL=%s\n\n' "$ISSUER_BASE_URL"
    printf 'COOKIE_KEYS=%s\n' "$cookie_key"
    printf 'TWO_FACTOR_ENCRYPTION_KEY=%s\n' "$tfe_key"
    printf 'SIGNING_KEY_ENCRYPTION_KEY=%s\n\n' "$signing_key"
    printf 'SMTP_HOST=%s\n' "$SMTP_HOST"
    printf 'SMTP_PORT=%s\n' "$SMTP_PORT"
    printf 'SMTP_USER="%s"\n' "$(quote_env_value "$SMTP_USER")"
    printf 'SMTP_PASS="%s"\n' "$(quote_env_value "$SMTP_PASS")"
    printf 'SMTP_FROM="%s"\n\n' "$(quote_env_value "$SMTP_FROM")"
    printf 'LOG_LEVEL=info\n'
    printf 'TRUST_PROXY=%s\n' "$TRUST_PROXY"
    printf 'TRUST_PROXY_HOPS=%s\n' "$TRUST_PROXY_HOPS"
    printf 'PORTA_AUTO_MIGRATE=false\n'
    printf 'METRICS_ENABLED=false\n'
  } >"$ENV_FILE"

  chmod 600 "$ENV_FILE"
}

# Writes the compose stack. Values are sourced from .env at runtime, so the file
# itself contains no secrets and never needs to be rewritten on reinstall.
write_compose_file() {
  cat >"$COMPOSE_FILE" <<'YAML'
# Porta standalone stack — generated by install-porta.sh
# Values are read from .env (see env_file and ${...} substitutions below).
services:
  porta:
    image: ${PORTA_IMAGE:-blendsdk/porta:latest}
    container_name: porta-app
    restart: unless-stopped
    ports:
      - "${BIND_ADDR:-0.0.0.0}:${HOST_PORT:-3000}:3000"
    env_file:
      - .env
    environment:
      DATABASE_URL: postgresql://porta:${POSTGRES_PASSWORD}@postgres:5432/porta
      REDIS_URL: redis://redis:6379
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/health"]
      interval: 30s
      timeout: 5s
      start_period: 30s
      retries: 3

  postgres:
    image: postgres:16-alpine
    container_name: porta-postgres
    restart: unless-stopped
    environment:
      POSTGRES_DB: porta
      POSTGRES_USER: porta
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
    volumes:
      - porta_pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -h 127.0.0.1 -U porta"]
      interval: 5s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    container_name: porta-redis
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 5s
      retries: 5

  # MailHog captures outgoing email without delivering it. It is only started
  # with `--profile dev` and is intended for evaluation, not production.
  mailhog:
    image: mailhog/mailhog
    container_name: porta-mailhog
    restart: unless-stopped
    profiles:
      - dev
    ports:
      - "8025:8025"
      - "1025:1025"

volumes:
  porta_pgdata:
    driver: local
YAML
}

# ─────────────────────────────────────────────────────────────────────────────
# Deployment actions
# ─────────────────────────────────────────────────────────────────────────────

# Runs a Docker Compose command against the generated project. The .env file is
# passed explicitly so the command works regardless of the caller's directory,
# and no subshell is used so that failures are reported by a single error trap.
compose() {
  docker compose --env-file "$ENV_FILE" --project-directory "$TARGET_DIR" -f "$COMPOSE_FILE" "$@"
}

# Blocks until PostgreSQL and Redis accept connections. The migration container
# is started with --no-deps, so it does not wait for the compose health checks;
# connecting before the database is ready fails with ECONNREFUSED. The check
# forces TCP (-h 127.0.0.1): during first-time initdb PostgreSQL briefly answers
# on its Unix socket only, which is not yet reachable over the network.
wait_for_dependencies() {
  local deadline=$((SECONDS + HEALTH_TIMEOUT_SECONDS))
  log "Waiting for PostgreSQL and Redis to accept connections..."
  while (( SECONDS < deadline )); do
    if compose exec -T postgres pg_isready -h 127.0.0.1 -p 5432 -U porta >/dev/null 2>&1 \
      && compose exec -T redis redis-cli ping >/dev/null 2>&1; then
      ok "Database and cache are ready."
      return 0
    fi
    sleep 2
  done
  die "PostgreSQL/Redis did not become ready within ${HEALTH_TIMEOUT_SECONDS}s. Check: (cd \"${TARGET_DIR}\" && docker compose logs postgres redis)"
}

# Applies database migrations as an explicit step before the server starts.
run_migrations() {
  log "Applying database migrations..."
  compose run --rm --no-deps porta node dist/cli/index.js migrate up
  ok "Migrations complete."
}

# Polls the health endpoint until the server reports ready or time runs out.
wait_for_health() {
  local url="http://127.0.0.1:${HOST_PORT}/health"
  local deadline=$((SECONDS + HEALTH_TIMEOUT_SECONDS))
  log "Waiting for Porta to become healthy at ${url} ..."
  while (( SECONDS < deadline )); do
    if command -v curl >/dev/null 2>&1; then
      if curl -fsS --max-time 3 "$url" >/dev/null 2>&1; then
        ok "Porta is healthy."
        return 0
      fi
    elif wget -q -T 3 -O /dev/null "$url" 2>/dev/null; then
      ok "Porta is healthy."
      return 0
    fi
    sleep 2
  done
  warn "Porta did not report healthy within ${HEALTH_TIMEOUT_SECONDS}s. Check: (cd \"${TARGET_DIR}\" && docker compose logs porta)"
  return 1
}

# Creates the first admin user. Runs non-interactively when credentials were
# supplied; otherwise prints the command for the operator to run.
bootstrap_admin() {
  if [ -n "$ADMIN_EMAIL" ]; then
    [ -n "$ADMIN_PASSWORD" ] || die "--admin-email requires --admin-password."
    log "Bootstrapping the admin system..."
    compose exec -T porta porta init \
      --email "$ADMIN_EMAIL" \
      --given-name "$ADMIN_GIVEN_NAME" \
      --family-name "$ADMIN_FAMILY_NAME" \
      --password "$ADMIN_PASSWORD"
    ok "Admin system bootstrapped for ${ADMIN_EMAIL}."
    return 0
  fi

  if [ -n "$TTY_DEV" ]; then
    if confirm "Bootstrap the admin system now (interactive)?" "y"; then
      log "Starting interactive admin bootstrap..."
      # Redirect the pseudo-terminal into the container so `porta init` prompts work.
      docker exec -it porta-app porta init <"$TTY_DEV" >"$TTY_DEV" 2>&1
      ok "Admin bootstrap finished."
      return 0
    fi
  fi

  warn "Admin system not bootstrapped. Run it later with:"
  printf '    docker exec -it porta-app porta init\n' >&2
}

# Prints a ready-to-paste nginx reverse-proxy block for the chosen port.
print_nginx_hint() {
  local host
  host="$(issuer_host "$ISSUER_BASE_URL")"
  cat <<EOF

Suggested nginx reverse-proxy block for ${host}:

  server {
      listen 443 ssl http2;
      server_name ${host};

      server_tokens off;

      ssl_certificate     /etc/ssl/certs/${host}.pem;
      ssl_certificate_key /etc/ssl/private/${host}-key.pem;

      location / {
          proxy_pass http://127.0.0.1:${HOST_PORT};
          proxy_set_header Host \$host;
          proxy_set_header X-Real-IP \$remote_addr;
          proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
          proxy_set_header X-Forwarded-Proto \$scheme;
      }
  }

EOF
}

# ─────────────────────────────────────────────────────────────────────────────
# Main
# ─────────────────────────────────────────────────────────────────────────────

main() {
  parse_args "$@"
  setup_terminal

  [ -n "$TARGET_DIR" ] || TARGET_DIR="$DEFAULT_DIR"
  # Resolve the target directory to an absolute path before changing directories.
  mkdir -p "$TARGET_DIR"
  TARGET_DIR="$(cd "$TARGET_DIR" && pwd)"
  COMPOSE_FILE="${TARGET_DIR}/docker-compose.yml"
  ENV_FILE="${TARGET_DIR}/.env"

  if [ -e "$COMPOSE_FILE" ] || [ -e "$ENV_FILE" ]; then
    if [ "$FORCE" != "1" ]; then
      die "Existing files found in ${TARGET_DIR}. Re-run with --force to overwrite."
    fi
    warn "Overwriting existing files in ${TARGET_DIR} (--force)."
  fi

  # Reuse answers from a previous run unless the caller asked for a fresh start.
  load_existing_configuration
  if [ "$FRESH" = "1" ] && [ -f "$ENV_FILE" ]; then
    warn "--fresh ignores saved secrets. If this deployment already has data, remove the old volume first: (cd \"${TARGET_DIR}\" && docker compose down -v)"
  fi

  [ -n "$PORTA_IMAGE" ] || PORTA_IMAGE="$PORTA_IMAGE_DEFAULT"

  # ── Public URL and reverse-proxy posture ────────────────────────────────
  if [ -z "$ISSUER_BASE_URL" ]; then
    prompt_value ISSUER_BASE_URL "Public URL for Porta (for example https://auth.example.com)"
  fi
  validate_issuer_url "$ISSUER_BASE_URL"

  if [ "$ALLOW_HTTP" = "1" ]; then
    warn "Evaluation mode (--allow-http): production mode and proxy trust are disabled."
    NODE_ENV_VALUE="development"
    TRUST_PROXY="false"
  else
    NODE_ENV_VALUE="production"
  fi

  [ -n "$TRUST_PROXY" ] || TRUST_PROXY="true"
  [ -n "$TRUST_PROXY_HOPS" ] || TRUST_PROXY_HOPS="1"

  # ── Host port ───────────────────────────────────────────────────────────
  if [ -z "$HOST_PORT" ]; then
    local used_ports suggested
    used_ports="$(collect_docker_ports; collect_host_ports)"
    suggested="$(suggest_port "$used_ports" || true)"
    [ -n "$suggested" ] || die "Could not find a free host port between ${DEFAULT_PORT_START} and $((DEFAULT_PORT_START+PORT_SCAN_RANGE))."

    if [ -n "$TTY_IN" ]; then
      HOST_PORT="$(read_answer "Host port to expose Porta on" "$suggested")"
    else
      HOST_PORT="$suggested"
      log "Selected free host port ${HOST_PORT} (no terminal detected)."
    fi
  fi
  validate_port "$HOST_PORT"
  if [ "$REUSED_CONFIG" != "1" ] \
    && printf '%s\n' "$(collect_docker_ports; collect_host_ports)" | grep -qx "$HOST_PORT"; then
    warn "Port ${HOST_PORT} appears to be in use. Docker will fail to start if it is taken."
  fi

  # ── Bind address ────────────────────────────────────────────────────────
  if [ -z "$BIND_ADDR" ]; then
    if [ -n "$TTY_IN" ]; then
      BIND_ADDR="$(read_answer "Host interface to bind" "0.0.0.0")"
    else
      BIND_ADDR="0.0.0.0"
    fi
  fi
  case "$BIND_ADDR" in
    *" "*|"") die "Invalid bind address: '${BIND_ADDR}'" ;;
  esac

  # ── SMTP ────────────────────────────────────────────────────────────────
  if [ "$SKIP_SMTP" = "1" ]; then
    SMTP_HOST="mailhog"
    SMTP_PORT="1025"
    SMTP_USER=""
    SMTP_PASS=""
    warn "SMTP skipped: email will be captured by MailHog, not delivered."
  else
    prompt_value SMTP_HOST "SMTP relay hostname (or 'skip' for MailHog evaluation)"
    if [ "$SMTP_HOST" = "skip" ]; then
      SKIP_SMTP="1"
      SMTP_HOST="mailhog"
      SMTP_PORT="1025"
      SMTP_USER=""
      SMTP_PASS=""
    fi
    [ -n "$SMTP_PORT" ] || SMTP_PORT="587"
    if [ "$SKIP_SMTP" != "1" ] && [ "$REUSED_CONFIG" != "1" ] && [ -n "$TTY_IN" ]; then
      SMTP_USER="$(read_answer "SMTP username (blank if none)" "${SMTP_USER:-}")"
      SMTP_PASS="$(read_answer "SMTP password (blank if none)" "${SMTP_PASS:-}" 1)"
      SMTP_FROM="$(read_answer "Sender email address" "${SMTP_FROM:-noreply@$(issuer_host "$ISSUER_BASE_URL")}")"
    fi
  fi
  [ -n "$SMTP_FROM" ] || SMTP_FROM="noreply@$(issuer_host "$ISSUER_BASE_URL")"
  if [ "$SKIP_SMTP" != "1" ] && [ -n "$SMTP_USER" ] && [ -z "$SMTP_PASS" ]; then
    warn "SMTP_USER is set but SMTP_PASS is empty. Most relays reject unauthenticated senders; set a password if email delivery fails."
  fi

  # ── Admin bootstrap defaults ────────────────────────────────────────────
  if [ -n "$ADMIN_EMAIL" ]; then
    [ -n "$ADMIN_PASSWORD" ] || die "--admin-email requires --admin-password."
    [ -n "$ADMIN_GIVEN_NAME" ] || ADMIN_GIVEN_NAME="Admin"
    [ -n "$ADMIN_FAMILY_NAME" ] || ADMIN_FAMILY_NAME="User"
  fi

  # ── Secrets ─────────────────────────────────────────────────────────────
  # Reuse secrets loaded from the existing .env. The PostgreSQL volume keeps the
  # password from the first run, and changing the root encryption keys would make
  # already-encrypted data undecryptable.
  [ -n "$POSTGRES_PASSWORD" ] || POSTGRES_PASSWORD="$(random_token 24)"
  local cookie_key tfe_key signing_key
  cookie_key="${existing_cookie:-$(random_token 32)}"
  tfe_key="${existing_tfe:-$(random_hex64)}"
  signing_key="${existing_signing:-$(random_hex64)}"
  # The two root keys must differ or Porta refuses to start (domain separation).
  while [ "$signing_key" = "$tfe_key" ]; do
    signing_key="$(random_hex64)"
  done

  # ── Write configuration ─────────────────────────────────────────────────
  log "Writing ${COMPOSE_FILE}"
  write_compose_file
  log "Writing ${ENV_FILE} (permissions 600)"
  write_env_file "$cookie_key" "$tfe_key" "$signing_key"

  # ── Start ───────────────────────────────────────────────────────────────
  if [ "$DO_START" != "1" ]; then
    ok "Configuration generated (--no-start)."
    cat <<EOF

Next steps:
  cd "${TARGET_DIR}"
  docker compose up -d --wait postgres redis
  docker compose run --rm --no-deps porta node dist/cli/index.js migrate up
$([ "$SKIP_SMTP" = "1" ] && echo '  docker compose --profile dev up -d' || echo '  docker compose up -d')
  docker exec -it porta-app porta init
EOF
    printf '\nPublic URL: %s\n' "$ISSUER_BASE_URL"
    printf 'Host port:  %s (bound to %s)\n' "$HOST_PORT" "$BIND_ADDR"
    return 0
  fi

  require_docker
  require_host_curl

  log "Starting PostgreSQL and Redis..."
  compose up -d postgres redis

  wait_for_dependencies

  run_migrations

  log "Starting Porta..."
  if [ "$SKIP_SMTP" = "1" ]; then
    compose --profile dev up -d
  else
    compose up -d
  fi

  wait_for_health || true

  bootstrap_admin || true

  # Final report.
  ok "Porta installation complete."
  printf '\n'
  printf '  Public URL:   %s\n' "$ISSUER_BASE_URL"
  printf '  Direct URL:   http://127.0.0.1:%s/health\n' "$HOST_PORT"
  printf '  Directory:    %s\n' "$TARGET_DIR"
  printf '  Compose file: %s\n' "$COMPOSE_FILE"
  printf '  Env file:     %s (600, contains secrets)\n' "$ENV_FILE"
  if [ "$SKIP_SMTP" = "1" ]; then
    printf '  Email:        MailHog inbox at http://127.0.0.1:8025 (not delivered)\n'
  fi
  printf '\nUseful commands:\n'
  printf '  cd %s\n' "$TARGET_DIR"
  printf '  docker compose logs -f porta\n'
  printf '  docker compose ps\n'
  printf '  docker compose down          # stop (keep data)\n'
  printf '  docker compose down -v       # stop and delete data\n'

  if [ "$TRUST_PROXY" = "true" ]; then
    print_nginx_hint
  else
    printf '\nPorta is exposed directly (TRUST_PROXY=false). Point clients at %s\n' "$ISSUER_BASE_URL"
  fi
}

main "$@"
