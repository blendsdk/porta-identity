#!/usr/bin/env bash
set -euo pipefail

# ─────────────────────────────────────────────────────────────────────────────
# Porta HTTPS Dev Setup — Certificate Generation Script
#
# Generates locally-trusted TLS certificates using mkcert for the Porta
# development environment. Creates certificates in docker/certs/ that are
# used by the nginx TLS-terminating reverse proxy.
#
# Usage:
#   scripts/setup-certs.sh           # Generate certs (skip if exist)
#   scripts/setup-certs.sh --force   # Regenerate even if certs exist
#
# Prerequisites:
#   - mkcert installed (https://github.com/FiloSottile/mkcert)
#
# What this script does:
#   1. Verifies mkcert is installed
#   2. Installs mkcert's local CA (browsers + Node.js will trust it)
#   3. Generates TLS certificate for porta.local, localhost, 127.0.0.1, ::1
#   4. Adds porta.local to /etc/hosts if not already present
# ─────────────────────────────────────────────────────────────────────────────

# ─── Configuration ──────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
CERT_DIR="$SCRIPT_DIR/../docker/certs"
CERT_FILE="$CERT_DIR/server.crt"
KEY_FILE="$CERT_DIR/server.key"
HOSTNAME="porta.local"
HOSTS_ENTRY="127.0.0.1 $HOSTNAME"

# ─── Parse flags ────────────────────────────────────────
FORCE=false
for arg in "$@"; do
  case "$arg" in
    --force) FORCE=true ;;
    -h|--help)
      echo "Usage: scripts/setup-certs.sh [--force]"
      echo "  --force  Regenerate certificates even if they exist"
      exit 0
      ;;
  esac
done

echo "🔒 Porta HTTPS Dev Setup"
echo "========================"
echo ""

# ─── Step 1: Check mkcert ──────────────────────────────
if ! command -v mkcert &>/dev/null; then
  echo "❌ mkcert is not installed."
  echo ""
  echo "Install mkcert for your platform:"
  echo ""
  echo "  macOS:   brew install mkcert"
  echo "  Linux:   sudo apt install mkcert  (or see https://github.com/FiloSottile/mkcert#installation)"
  echo "  Windows: choco install mkcert"
  echo ""
  exit 1
fi
echo "✅ mkcert found: $(mkcert --version 2>&1 || echo 'installed')"

# ─── Step 2: Install local CA ──────────────────────────
echo ""
echo "📋 Installing mkcert local CA (may require sudo)..."
if mkcert -install 2>&1; then
  echo "✅ Local CA installed (certificates will be trusted by browsers and Node.js)"
else
  echo "⚠️  Could not install CA automatically. Run manually with sudo:"
  echo "    sudo mkcert -install"
fi

# ─── Step 3: Generate certificate ───────────────────────
if [ -f "$CERT_FILE" ] && [ "$FORCE" = false ]; then
  echo ""
  echo "✅ Certificates already exist at docker/certs/"
  echo "   Use --force to regenerate."
else
  echo ""
  echo "📋 Generating TLS certificate..."
  mkdir -p "$CERT_DIR"
  mkcert \
    -cert-file "$CERT_FILE" \
    -key-file "$KEY_FILE" \
    "$HOSTNAME" localhost 127.0.0.1 ::1
  echo "✅ Certificate generated:"
  echo "   cert: docker/certs/server.crt"
  echo "   key:  docker/certs/server.key"
  echo "   SANs: $HOSTNAME, localhost, 127.0.0.1, ::1"
fi

# ─── Step 4: /etc/hosts entry ──────────────────────────
echo ""
if grep -qF "$HOSTNAME" /etc/hosts 2>/dev/null; then
  echo "✅ /etc/hosts already contains '$HOSTNAME'"
else
  echo "📋 Adding '$HOSTS_ENTRY' to /etc/hosts..."
  if command -v sudo &>/dev/null; then
    echo "$HOSTS_ENTRY" | sudo tee -a /etc/hosts >/dev/null
    echo "✅ Added '$HOSTS_ENTRY' to /etc/hosts"
  else
    echo "⚠️  sudo not available. Add this line to /etc/hosts manually:"
    echo "    $HOSTS_ENTRY"
  fi
fi

# ─── Done ───────────────────────────────────────────────
echo ""
echo "🎉 Setup complete!"
echo ""
echo "Next steps:"
echo "  1. yarn docker:up     # Start infrastructure (includes nginx TLS proxy)"
echo "  2. yarn dev            # Start Porta dev server"
echo "  3. Open https://porta.local:3443/health"
echo ""
