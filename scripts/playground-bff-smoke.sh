#!/bin/bash
set -e

# BFF Playground Smoke Test
#
# Verifies the BFF playground is running and responding correctly.
# Requires: Porta running on :3000, BFF running on :4001, Redis + Postgres up.
#
# Usage: bash scripts/playground-bff-smoke.sh

PASS=0
FAIL=0
BFF_URL="http://localhost:4001"

check() {
  local desc="$1"
  local url="$2"
  local expected="$3"
  local method="${4:-GET}"

  if [ "$method" = "POST" ]; then
    RESPONSE=$(curl -sf -X POST -w "%{http_code}" "$url" 2>/dev/null || echo "000")
  else
    RESPONSE=$(curl -sf -w "%{http_code}" "$url" 2>/dev/null || echo "000")
  fi

  HTTP_CODE="${RESPONSE: -3}"

  if [ "$HTTP_CODE" = "$expected" ]; then
    echo "  ✅ $desc (HTTP $HTTP_CODE)"
    PASS=$((PASS + 1))
  else
    echo "  ❌ $desc (expected $expected, got $HTTP_CODE)"
    FAIL=$((FAIL + 1))
  fi
}

check_contains() {
  local desc="$1"
  local url="$2"
  local needle="$3"

  BODY=$(curl -sf "$url" 2>/dev/null || echo "")

  if echo "$BODY" | grep -q "$needle"; then
    echo "  ✅ $desc (contains '$needle')"
    PASS=$((PASS + 1))
  else
    echo "  ❌ $desc (missing '$needle')"
    FAIL=$((FAIL + 1))
  fi
}

echo ""
echo "🔒 BFF Playground Smoke Test"
echo "════════════════════════════"
echo ""

# 1. Health check
echo "1. Health Check"
check "GET /health returns 200" "$BFF_URL/health" "200"
check_contains "Health response has status:ok" "$BFF_URL/health" '"status":"ok"'
echo ""

# 2. Dashboard (unauthenticated)
echo "2. Dashboard (Unauthenticated)"
check "GET / returns 200" "$BFF_URL/" "200"
check_contains "Dashboard has BFF title" "$BFF_URL/" "BFF Playground"
check_contains "Dashboard has welcome card" "$BFF_URL/" "Backend-for-Frontend"
echo ""

# 3. M2M page
echo "3. M2M Page"
check "GET /m2m returns 200" "$BFF_URL/m2m" "200"
check_contains "M2M page has title" "$BFF_URL/m2m" "Machine-to-Machine"
check_contains "M2M page has request button" "$BFF_URL/m2m" "btn-m2m-token"
echo ""

# 4. Auth login redirect
echo "4. Auth Login Redirect"
# Login should redirect to Porta — curl will get 302
REDIRECT_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$BFF_URL/auth/login?org=no2fa" 2>/dev/null || echo "000")
if [ "$REDIRECT_CODE" = "302" ]; then
  echo "  ✅ GET /auth/login?org=no2fa returns 302 redirect"
  PASS=$((PASS + 1))
else
  echo "  ❌ GET /auth/login?org=no2fa (expected 302, got $REDIRECT_CODE)"
  FAIL=$((FAIL + 1))
fi

# Check redirect target contains Porta URL
REDIRECT_LOCATION=$(curl -s -o /dev/null -w "%{redirect_url}" "$BFF_URL/auth/login?org=no2fa" 2>/dev/null || echo "")
if echo "$REDIRECT_LOCATION" | grep -q "localhost:3000"; then
  echo "  ✅ Login redirects to Porta (localhost:3000)"
  PASS=$((PASS + 1))
else
  echo "  ❌ Login redirect target missing Porta URL (got: $REDIRECT_LOCATION)"
  FAIL=$((FAIL + 1))
fi
echo ""

# 5. API routes (unauthenticated — should return 401)
echo "5. API Routes (Unauthenticated)"
check "POST /api/me returns 401" "$BFF_URL/api/me" "401" "POST"
check "POST /api/refresh returns 401" "$BFF_URL/api/refresh" "401" "POST"
check "POST /api/introspect returns 401" "$BFF_URL/api/introspect" "401" "POST"
check "POST /api/tokens returns 401" "$BFF_URL/api/tokens" "401" "POST"
echo ""

# 6. Static assets
echo "6. Static Assets"
check "GET /css/style.css returns 200" "$BFF_URL/css/style.css" "200"
check "GET /js/app.js returns 200" "$BFF_URL/js/app.js" "200"
echo ""

# 7. Login-method demo (Phase 10)
# ----------------------------------------------------------------------------
# The BFF exposes GET /debug/login-methods which returns JSON describing the
# currently-active login-method profile + the catalog of all profiles. These
# assertions verify the route is wired and that clientSecret is never leaked.
echo "7. Login-Method Debug Route"
check "GET /debug/login-methods returns 200" "$BFF_URL/debug/login-methods" "200"

DEBUG_BODY=$(curl -s "$BFF_URL/debug/login-methods" 2>/dev/null || echo "")
if echo "$DEBUG_BODY" | grep -q '"profiles"'; then
  echo "  ✅ Debug body contains profiles catalog"
  PASS=$((PASS + 1))
else
  echo "  ❌ Debug body missing 'profiles' key"
  FAIL=$((FAIL + 1))
fi

# Safety check: the debug endpoint MUST NOT leak client secrets.
if echo "$DEBUG_BODY" | grep -q 'clientSecret'; then
  echo "  ❌ Debug body leaks clientSecret (security regression!)"
  FAIL=$((FAIL + 1))
else
  echo "  ✅ Debug body does not leak clientSecret"
  PASS=$((PASS + 1))
fi
echo ""

# Summary

TOTAL=$((PASS + FAIL))
echo "════════════════════════════"
if [ $FAIL -eq 0 ]; then
  echo "✅ All $TOTAL checks passed!"
else
  echo "⚠️  $PASS/$TOTAL passed, $FAIL failed"
fi
echo ""

exit $FAIL
